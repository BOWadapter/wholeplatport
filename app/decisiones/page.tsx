import { AppShell } from '@/components/app-shell'
import { DecisionsScreen } from '@/components/screens/decisions-screen'
import { getSessionUser } from '@/lib/auth/server'

export default async function Page() {
  const user = await getSessionUser()
  return (
    <AppShell user={user}>
      <DecisionsScreen />
    </AppShell>
  )
}
