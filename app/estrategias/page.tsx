import { AppShell } from '@/components/app-shell'
import { StrategiesScreen } from '@/components/screens/strategies-screen'
import { getSessionUser } from '@/lib/auth/server'

export default async function Page() {
  const user = await getSessionUser()
  return (
    <AppShell user={user}>
      <StrategiesScreen />
    </AppShell>
  )
}
