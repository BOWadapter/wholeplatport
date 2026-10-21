'use client'

// Copiloto (RN-8): explica el estado con plantillas deterministas de lib/copilot.ts. No predice.

import { useEffect, useRef, useState } from 'react'
import { usePlatport } from '@/components/platport-context'
import { Badge, Card, ScreenHeader } from '@/components/ui-bits'
import { answer, SUGGESTED_QUESTIONS, type CopilotAnswer } from '@/lib/copilot'

interface Message {
  question: string
  response: CopilotAnswer
}

export function CopilotScreen() {
  const { sim } = usePlatport()
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages])

  const ask = (text: string) => {
    if (!text.trim()) return
    setMessages((current) => [...current, { question: text, response: answer(text, sim) }])
    setQuestion('')
  }

  return (
    <div className="screen">
      <ScreenHeader eyebrow="INTELIGENCIA / RN-8" title="Copiloto" />
      <Card>
        <p className="muted">
          Explico el estado actual de la simulación. No predigo precios ni recomiendo comprar o vender.
        </p>

        <div className="chips">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button key={q} className={q.includes('va a subir') ? 'demo-chip' : ''} onClick={() => ask(q)}>
              {q}
            </button>
          ))}
        </div>

        <div className="chat-log">
          {messages.map((m, i) => (
            <div key={i}>
              <div className="chat user-chat">{m.question}</div>
              <div className="chat assistant-chat">
                {m.response.text}
                {m.response.intent === 'sin_prediccion' && <Badge tone="amber-text">RN-8</Badge>}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form
          className="chat-form"
          onSubmit={(event) => {
            event.preventDefault()
            ask(question)
          }}
        >
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Pregunta sobre el estado…"
          />
          <button type="submit">Enviar</button>
        </form>
      </Card>
    </div>
  )
}
