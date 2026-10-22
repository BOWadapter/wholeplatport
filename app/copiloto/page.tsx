import { AppShell } from '@/components/app-shell'
import { CopilotScreen } from '@/components/screens/copilot-screen'
import { getSessionUser } from '@/lib/auth/server'

export default async function Page() {
  const user = await getSessionUser()
  return (
    <AppShell user={user}>
      <CopilotScreen />
    </AppShell>
  )
}
