// Legacy /register route — the auth flow is now unified on /login (one
// page, two tabs). Server-side redirect so any old link or cached
// browser bookmark still lands on the new auth experience.

import { redirect } from 'next/navigation'

export default function RegisterRedirect() {
  redirect('/login')
}
