-- Enable pgvector for ZeroEntropy embeddings
create extension if not exists vector;

-- ─── Users ────────────────────────────────────────────────────────────────────
-- Mirrors auth.users; we keep a public copy for joins
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  created_at timestamptz default now()
);

alter table public.users enable row level security;
create policy "Users can read own row" on public.users
  for select using (auth.uid() = id);

-- Auto-create public.users row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── User Preferences ─────────────────────────────────────────────────────────
create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  city text not null,
  budget_min integer default 0,
  budget_max integer not null,
  bedrooms_min integer default 1,
  needs_gender_groups boolean default false,
  commute_origin text,               -- e.g. "69 Charlton St, New York, NY"
  commute_max_minutes integer default 45,
  deal_breakers jsonb default '[]',  -- ["no parking", "no pets allowed"]
  nice_to_haves jsonb default '[]',  -- ["in-unit laundry", "dishwasher"]
  stay_duration text default 'permanent', -- 'permanent' | 'internship' | 'short-term'
  open_to_shared boolean default false,
  max_roommates integer default 0,
  updated_at timestamptz default now(),
  unique (user_id)
);

alter table public.user_preferences enable row level security;
create policy "Users manage own preferences" on public.user_preferences
  for all using (auth.uid() = user_id);

-- ─── Listings ─────────────────────────────────────────────────────────────────
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('zillow', 'apartments_com', 'fb', 'hog', 'craigslist')),
  external_id text,
  title text,
  price integer,                     -- monthly rent USD
  rooms integer default 1,           -- total bedrooms (for shared room math)
  price_per_room integer generated always as (
    case when rooms > 0 then price / rooms else price end
  ) stored,
  address text,
  lat numeric(10, 7),
  lng numeric(10, 7),
  sqft integer,
  has_photos boolean default false,
  photo_urls jsonb default '[]',
  amenities jsonb default '[]',      -- ["in-unit laundry", "dishwasher", "parking"]
  url text,
  contact_email text,
  contact_name text,
  is_flagged_scam boolean default false,
  scam_flags jsonb default '[]',     -- ["no_photos", "wire_transfer_request"]
  raw_data jsonb,
  scraped_at timestamptz default now(),
  unique (source, external_id)
);

create index listings_source_idx on public.listings(source);
create index listings_price_idx on public.listings(price);
create index listings_city_idx on public.listings((raw_data->>'city'));

-- Listings are public-readable (no PII), write-restricted to service role
alter table public.listings enable row level security;
create policy "Listings are readable by authenticated users" on public.listings
  for select to authenticated using (true);

-- ─── Listing Vectors (ZeroEntropy zembed-1 output) ────────────────────────────
create table public.listing_vectors (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  embedding vector(1024),            -- zembed-1 produces 1024-dim vectors
  embedded_at timestamptz default now()
);

-- No RLS needed — service role only writes this; users query via API

-- ─── Listing Matches (per-user ranked results) ────────────────────────────────
create table public.listing_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  relevance_score numeric(6, 4),     -- zerank-2 output (0-1)
  commute_minutes integer,           -- Google Maps transit time
  status text default 'new' check (
    status in ('new', 'contacted', 'responded', 'touring', 'passed', 'semi_dead')
  ),
  follow_up_count integer default 0,
  last_follow_up_at timestamptz,
  matched_at timestamptz default now(),
  unique (user_id, listing_id)
);

create index listing_matches_user_status_idx on public.listing_matches(user_id, status);

alter table public.listing_matches enable row level security;
create policy "Users manage own matches" on public.listing_matches
  for all using (auth.uid() = user_id);

-- ─── Outreach Messages ────────────────────────────────────────────────────────
create table public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  message_text text not null,
  channel text not null check (channel in ('email', 'fb_messenger')),
  status text default 'sent' check (status in ('draft', 'sent', 'bounced', 'opened')),
  resend_message_id text,
  sent_at timestamptz default now()
);

alter table public.outreach_messages enable row level security;
create policy "Users read own outreach" on public.outreach_messages
  for all using (auth.uid() = user_id);

-- ─── Landlord Responses ───────────────────────────────────────────────────────
create table public.landlord_responses (
  id uuid primary key default gen_random_uuid(),
  outreach_id uuid not null references public.outreach_messages(id) on delete cascade,
  response_text text,
  received_at timestamptz default now()
);

alter table public.landlord_responses enable row level security;
create policy "Users read responses to own outreach" on public.landlord_responses
  for select using (
    exists (
      select 1 from public.outreach_messages o
      where o.id = outreach_id and o.user_id = auth.uid()
    )
  );

-- ─── User Feedback ────────────────────────────────────────────────────────────
create table public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  action text not null check (action in ('rejected', 'favorited', 'touring', 'passed')),
  reason text,                       -- free text: "too loud", "no parking"
  created_at timestamptz default now()
);

alter table public.user_feedback enable row level security;
create policy "Users manage own feedback" on public.user_feedback
  for all using (auth.uid() = user_id);

-- ─── FB Groups ────────────────────────────────────────────────────────────────
create table public.fb_groups (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  group_name text not null,
  group_url text not null unique,
  is_private boolean default false,
  is_gender_specific boolean default false,
  gender_target text check (gender_target in ('female', 'male', 'lgbtq', null)),
  member_count integer,
  is_active boolean default true,
  last_scraped_at timestamptz,
  created_at timestamptz default now()
);

create index fb_groups_city_idx on public.fb_groups(city);

alter table public.fb_groups enable row level security;
create policy "FB groups readable by authenticated users" on public.fb_groups
  for select to authenticated using (true);
