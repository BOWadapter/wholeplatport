import { AppShell } from '@/components/app-shell'
import { RiskScreen } from '@/components/screens/risk-screen'
import { getSessionUser } from '@/lib/auth/server'

export default async function Page() {
  const user = await getSessionUser()
  return (
    <AppShell user={user}>
      <RiskScreen />
    </AppShell>
  )
}
