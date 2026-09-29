import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, clearTokens, setTokens } from '../../api/client'
import { api } from '../../api/http'
import type { UserOut } from '../../api/types'

type AuthState = {
  user: UserOut | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
  isAdmin: boolean
  isTeacher: boolean
}

const AuthCtx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [authFailed, setAuthFailed] = useState(false)

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api.get<UserOut>('/auth/me')
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setAuthFailed(true)
          return null
        }
        throw e
      }
    },
    retry: false,
    staleTime: 60_000,
  })

  const login = useCallback(
    async (email: string, password: string) => {
      const tok = await api.post<{ access_token: string; refresh_token: string }>(
        '/auth/login',
        { email, password },
      )
      setTokens(tok.access_token, tok.refresh_token)
      setAuthFailed(false)
      await qc.invalidateQueries({ queryKey: ['me'] })
    },
    [qc],
  )

  const logout = useCallback(() => {
    clearTokens()
    setAuthFailed(true)
    qc.setQueryData(['me'], null)
  }, [qc])

  const refreshUser = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['me'] })
  }, [qc])

  const user = authFailed ? null : (meQuery.data ?? null)
  const role = user?.role

  return (
    <AuthCtx.Provider
      value={{
        user,
        loading: meQuery.isPending && !authFailed,
        login,
        logout,
        refreshUser,
        // Role is a capability level (admin > teacher > student).
        isAdmin: role === 'admin',
        isTeacher: role === 'teacher' || role === 'admin',
      }}
    >
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
