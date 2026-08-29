import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Sparkles, User, BrainCircuit } from 'lucide-react';
import api from '../services/api';

export default function CoachChat() {
  const [messages, setMessages] = useState([
    {
      sender: 'coach',
      text: "Hello! 👋 I'm your **AI Interview Coach**. \n\nI can help you review algorithms, explain tricky systems, mock behavioral scenarios, or polish your descriptions. What concept or role are we preparing for today?",
      createdAt: new Date().toISOString()
    }
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);


  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, sending]);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || sending) return;

    const userMessage = {
      sender: 'user',
      text: input,
      createdAt: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSending(true);

    try {
      // Map message logs to history format (excluding current message)
      const chatHistory = messages.map(msg => ({
        sender: msg.sender,
        text: msg.text
      }));

      const response = await api.post('/interviews/coach-chat', {
        message: userMessage.text,
        chatHistory
      });

      const coachMessage = {
        sender: 'coach',
        text: response.data.reply || "I'm sorry, I didn't catch that. Could you repeat it?",
        createdAt: new Date().toISOString()
      };

      setMessages(prev => [...prev, coachMessage]);
    } catch (err) {
      console.log(err);
      console.error('Error in coach chat:', err);
      
      const backendError = err.response?.data?.message || err.message;
      setMessages(prev => [...prev, {
        sender: 'coach',
        text: `⚠️ System offline. Error: ${backendError}. Please verify your internet or try again.`,
        createdAt: new Date().toISOString()
      }]);
    } finally {
      setSending(false);
    }
  };

  const renderMarkdown = (text) => {
    if (!text) return '';

    // Normalize line endings to avoid Carriage Return quirks on Windows/other systems
    let html = text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    // Parse Javascript/generic code blocks
    html = html.replace(/\`\`\`javascript([\s\S]*?)\`\`\`/gim, (match, code) => {
      return `<pre style="background: hsl(var(--bg-dark)); padding: 0.75rem; border-radius: var(--radius-sm); margin: 0.5rem 0; font-family: monospace; font-size: 0.85rem; overflow-x: auto; border: 1px solid hsl(var(--border-light)); color: #a9b1d6;">${code.trim()}</pre>`;
    });

    html = html.replace(/\`\`\`([\s\S]*?)\`\`\`/gim, (match, code) => {
      return `<pre style="background: hsl(var(--bg-dark)); padding: 0.75rem; border-radius: var(--radius-sm); margin: 0.5rem 0; font-family: monospace; font-size: 0.85rem; overflow-x: auto; border: 1px solid hsl(var(--border-light));">${code.trim()}</pre>`;
    });

    // Parse inline code segments
    html = html.replace(/\`([^\`]+)\`/gim, '<code style="background: hsl(var(--bg-dark)); padding: 0.1rem 0.3rem; border-radius: 3px; font-family: monospace; font-size: 0.9rem;">$1</code>');

    // Parse lines to detect header patterns, lists and bullets
    const lines = html.split('\n');
    const processedLines = lines.map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('###')) {
        return `<h4 style="margin: 1rem 0 0.5rem 0; color: hsl(var(--secondary)); font-weight: 600; font-size: 1.05rem;">${trimmed.substring(3).trim()}</h4>`;
      }
      if (trimmed.startsWith('##')) {
        return `<h3 style="margin: 1.25rem 0 0.75rem 0; color: hsl(var(--primary)); font-weight: 700; font-size: 1.2rem;">${trimmed.substring(2).trim()}</h3>`;
      }
      if (trimmed.startsWith('#')) {
        return `<h2 style="margin: 1.5rem 0 1rem 0; color: hsl(var(--primary)); font-weight: 700; font-size: 1.4rem;">${trimmed.substring(1).trim()}</h2>`;
      }
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        return `<li style="margin-left: 1.25rem; margin-bottom: 0.35rem; list-style-type: disc;">${trimmed.substring(1).trim()}</li>`;
      }
      return line;
    });

    html = processedLines.join('\n');

    // Parse bold tags
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Convert breaks
    html = html.replace(/\n/g, '<br />');

    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MessageSquare size={24} style={{ color: 'hsl(var(--primary))' }} />
          AI Coach Companion
        </h1>
        <p style={{ color: 'hsl(var(--text-muted))', fontSize: '0.9rem' }}>
          Ask questions, explain code challenges, review structural approaches, or practice STAR templates.
        </p>
      </div>

      {/* Chat Container */}
      <div className="chat-container">
        {/* Messages list */}
        <div className="chat-messages">
          {messages.map((msg, index) => {
            const isCoach = msg.sender === 'coach';
            return (
              <div
                key={index}
                className={`chat-bubble ${isCoach ? 'coach' : 'user'}`}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                  {isCoach ? (
                    <BrainCircuit size={14} style={{ color: 'hsl(var(--primary))' }} />
                  ) : (
                    <User size={14} style={{ color: 'white' }} />
                  )}
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: isCoach ? 'hsl(var(--primary))' : 'white' }}>
                    {isCoach ? 'Coach' : 'You'}
                  </span>
                </div>

                <div className="bubble-text" style={{ lineHeight: '1.5' }}>
                  {isCoach ? renderMarkdown(msg.text) : msg.text}
                </div>

                <span style={{
                  fontSize: '0.65rem',
                  color: isCoach ? 'hsl(var(--text-dark))' : 'rgba(255, 255, 255, 0.6)',
                  alignSelf: 'flex-end',
                  marginTop: '0.25rem'
                }}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })}

          {sending && (
            <div className="chat-bubble coach" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: 'hsl(var(--text-muted))',
                animation: 'pulseGlow 1s infinite'
              }}></div>
              <span style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))', fontStyle: 'italic' }}>Coach is typing...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSend} className="chat-input-area">
          <input
            type="text"
            placeholder="Type your question (e.g. 'How do JavaScript closures work?' or 'Explain the STAR method')..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending}
            style={{ borderRadius: 'var(--radius-sm)' }}
          />
          <button
            type="submit"
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.75rem 1.25rem' }}
            disabled={sending || !input.trim()}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
