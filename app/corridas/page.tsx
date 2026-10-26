import { AppShell } from '@/components/app-shell'
import { RunsScreen } from '@/components/screens/runs-screen'
import { getSessionUser } from '@/lib/auth/server'

export default async function Page() {
  const user = await getSessionUser()
  return (
    <AppShell user={user}>
      <RunsScreen />
    </AppShell>
  )
}
