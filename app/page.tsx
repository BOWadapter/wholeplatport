import { AppShell } from '@/components/app-shell'
import { PortfolioScreen } from '@/components/screens/portfolio-screen'
import { getSessionUser } from '@/lib/auth/server'

export default async function Page() {
  const user = await getSessionUser()
  return (
    <AppShell user={user}>
      <PortfolioScreen />
    </AppShell>
  )
}
