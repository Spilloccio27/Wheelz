/**
 * Accesso, registrazione e recupero password.
 *
 * Compare solo quando Supabase è configurato: in modalità demo l'officina si
 * apre direttamente, perché non c'è nulla da proteggere.
 *
 * Due strade in registrazione:
 *  - senza codice invito → si fonda una nuova officina e chi si registra ne
 *    diventa titolare;
 *  - con codice invito → si entra in un'officina esistente, con il ruolo
 *    stabilito da chi ha invitato.
 */

import { useState } from 'react'
import { Wrench } from 'lucide-react'
import authService from '../data/authService.js'
import { lunghezzaMinimaPassword } from '../data/supabaseClient.js'
import { useApp } from '../context/AppContext.jsx'
import { Avviso, Button, Campo, Card, Input, cx } from './ui.jsx'

const MODI = {
  accesso: { titolo: 'Accedi', azione: 'Accedi' },
  registrazione: { titolo: 'Crea il tuo account', azione: 'Registrati' },
  recupero: { titolo: 'Recupera la password', azione: 'Invia il link' },
}

export default function Login() {
  const { toast, avviaDemo } = useApp()
  const [modo, setModo] = useState('accesso')
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState(null)
  const [messaggio, setMessaggio] = useState(null)
  const [campi, setCampi] = useState({
    email: '',
    password: '',
    nome: '',
    ragioneSociale: '',
    codiceInvito: '',
  })

  const set = (k) => (e) => setCampi((c) => ({ ...c, [k]: e.target.value }))

  async function invia(e) {
    e.preventDefault()
    setErrore(null)
    setMessaggio(null)
    setInCorso(true)
    try {
      if (modo === 'accesso') {
        await authService.accedi(campi.email, campi.password)
      } else if (modo === 'registrazione') {
        const esito = await authService.registra(campi)
        if (esito.confermaRichiesta) {
          setMessaggio(
            'Ti abbiamo inviato un’email di conferma. Apri il link e poi torna qui per accedere.',
          )
          setModo('accesso')
        }
      } else {
        await authService.reimpostaPassword(campi.email)
        setMessaggio('Se l’indirizzo è registrato, riceverai un’email con il link per reimpostare la password.')
      }
    } catch (err) {
      setErrore(err?.message || 'Operazione non riuscita.')
    } finally {
      setInCorso(false)
    }
  }

  const conInvito = Boolean(campi.codiceInvito.trim())

  return (
    <div className="min-h-screen grid place-items-center p-4 bg-[var(--surface-2)]">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <span className="h-11 w-11 rounded-2xl bg-accent-500 grid place-items-center">
            <Wrench size={22} className="text-white" aria-hidden />
          </span>
          <div>
            <p className="font-semibold text-lg leading-tight">MechFlow</p>
            <p className="text-xs text-[var(--ink-3)]">Gestionale per autofficine</p>
          </div>
        </div>

        <Card>
          <h1 className="text-lg font-semibold mb-1">{MODI[modo].titolo}</h1>
          <p className="text-xs text-[var(--ink-3)] mb-5">
            {modo === 'registrazione'
              ? conInvito
                ? 'Stai entrando in un’officina esistente con un codice invito.'
                : 'Senza codice invito verrà creata una nuova officina e sarai tu il titolare.'
              : modo === 'recupero'
                ? 'Inserisci l’indirizzo con cui ti sei registrato.'
                : 'Inserisci le tue credenziali per entrare.'}
          </p>

          {errore && (
            <Avviso tipo="errore" className="mb-4">
              {errore}
            </Avviso>
          )}
          {messaggio && (
            <Avviso tipo="ok" className="mb-4">
              {messaggio}
            </Avviso>
          )}

          <form onSubmit={invia} className="space-y-3.5">
            {modo === 'registrazione' && (
              <>
                <Campo etichetta="Nome e cognome" obbligatorio>
                  {(id) => (
                    <Input id={id} value={campi.nome} onChange={set('nome')} required autoComplete="name" />
                  )}
                </Campo>
                <Campo etichetta="Codice invito" aiuto="Lascialo vuoto per creare una nuova officina.">
                  {(id) => (
                    <Input
                      id={id}
                      value={campi.codiceInvito}
                      onChange={set('codiceInvito')}
                      placeholder="MF-XXXX-XXXX"
                      autoComplete="off"
                      className="font-mono uppercase"
                    />
                  )}
                </Campo>
                {!conInvito && (
                  <Campo etichetta="Ragione sociale dell’officina" obbligatorio>
                    {(id) => (
                      <Input
                        id={id}
                        value={campi.ragioneSociale}
                        onChange={set('ragioneSociale')}
                        required
                        placeholder="Autofficina Rossi & Figli S.n.c."
                      />
                    )}
                  </Campo>
                )}
              </>
            )}

            <Campo etichetta="Email" obbligatorio>
              {(id) => (
                <Input
                  id={id}
                  type="email"
                  value={campi.email}
                  onChange={set('email')}
                  required
                  autoComplete="email"
                />
              )}
            </Campo>

            {modo !== 'recupero' && (
              <Campo
                etichetta="Password"
                obbligatorio
                aiuto={
                  modo === 'registrazione'
                    ? `Almeno ${lunghezzaMinimaPassword} caratteri, con lettere e numeri.`
                    : undefined
                }
              >
                {(id) => (
                  <Input
                    id={id}
                    type="password"
                    value={campi.password}
                    onChange={set('password')}
                    required
                    minLength={modo === 'registrazione' ? lunghezzaMinimaPassword : undefined}
                    autoComplete={modo === 'registrazione' ? 'new-password' : 'current-password'}
                  />
                )}
              </Campo>
            )}

            <Button type="submit" variante="primario" className="w-full" caricamento={inCorso}>
              {MODI[modo].azione}
            </Button>
          </form>

          <div className="mt-5 pt-4 border-t border-[var(--line)] flex flex-wrap gap-x-4 gap-y-2 text-xs">
            {modo !== 'accesso' && (
              <Collegamento onClick={() => setModo('accesso')}>Ho già un account</Collegamento>
            )}
            {modo !== 'registrazione' && (
              <Collegamento onClick={() => setModo('registrazione')}>Crea un account</Collegamento>
            )}
            {modo !== 'recupero' && (
              <Collegamento onClick={() => setModo('recupero')}>Password dimenticata</Collegamento>
            )}
          </div>
        </Card>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={async () => {
              await avviaDemo()
              toast('Officina demo aperta: i dati non vengono salvati.')
            }}
            className="text-xs text-[var(--ink-3)] hover:text-[var(--ink-2)] underline underline-offset-2"
          >
            Guarda prima la demo, senza registrarti
          </button>
        </div>
      </div>
    </div>
  )
}

function Collegamento({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('text-accent-400 hover:text-accent-300 underline underline-offset-2')}
    >
      {children}
    </button>
  )
}
