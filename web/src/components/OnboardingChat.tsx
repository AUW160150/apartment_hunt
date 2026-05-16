'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content: "Hi! I'm your apartment hunting agent. I'll search across Zillow, Apartments.com, Facebook groups, and more — and reach out to landlords for you automatically.\n\nLet's start: which city are you moving to?",
}

export default function OnboardingChat() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [complete, setComplete] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { role: 'user', content: text }
    const updated = [...messages, userMsg]
    setMessages(updated)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updated }),
      })
      const data = await res.json()

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])

      if (data.complete) {
        setComplete(true)
        setTimeout(() => router.push('/dashboard'), 2000)
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Something went wrong. Please try again.',
      }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto">
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center gap-3">
        <div className="text-2xl">🏠</div>
        <div>
          <h1 className="font-semibold">ApartmentAgent</h1>
          <p className="text-sm text-muted-foreground">Setting up your search</p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-6 py-4">
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs">
                  {msg.role === 'assistant' ? '🏠' : 'Me'}
                </AvatarFallback>
              </Avatar>
              <div
                className={`rounded-2xl px-4 py-2.5 max-w-[80%] text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-xs">🏠</AvatarFallback>
              </Avatar>
              <div className="rounded-2xl px-4 py-2.5 bg-muted text-sm">
                <span className="animate-pulse">Thinking…</span>
              </div>
            </div>
          )}

          {complete && (
            <div className="text-center text-sm text-muted-foreground py-4">
              All set! Taking you to your dashboard…
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t px-6 py-4 flex gap-2">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your answer…"
          disabled={loading || complete}
          className="flex-1"
          autoFocus
        />
        <Button onClick={send} disabled={!input.trim() || loading || complete}>
          Send
        </Button>
      </div>
    </div>
  )
}
