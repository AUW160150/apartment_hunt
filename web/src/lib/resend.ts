import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? '')
}
const FROM = () => process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

export interface SendEmailResult {
  id: string | null
  error: string | null
}

export async function sendOutreachEmail(params: {
  to: string
  subject: string
  body: string
  replyTo?: string
}): Promise<SendEmailResult> {
  const { data, error } = await getResend().emails.send({
    from: FROM(),
    to: params.to,
    subject: params.subject,
    text: params.body,
    replyTo: params.replyTo,
  })

  if (error) return { id: null, error: error.message }
  return { id: data?.id ?? null, error: null }
}
