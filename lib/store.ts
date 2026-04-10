import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface AppState {
  // User state
  user: any | null
  setUser: (user: any) => void
  
  // UI state
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  
  // Theme state
  theme: 'light' | 'dark' | 'system'
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  
  // Notifications
  notifications: Notification[]
  addNotification: (notification: Notification) => void
  removeNotification: (id: string) => void
}

interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  duration?: number
}

export const useAppStore = create<AppState>()(
  devtools(
    (set, get) => ({
      user: null,
      setUser: (user) => set({ user }),
      
      sidebarOpen: true,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      
      notifications: [],
      addNotification: (notification) => {
        const id = Date.now().toString()
        const newNotification = { ...notification, id }
        set((state) => ({
          notifications: [...state.notifications, newNotification]
        }))
        
        // Auto-remove notification after duration
        if (notification.duration !== 0) {
          setTimeout(() => {
            get().removeNotification(id)
          }, notification.duration || 5000)
        }
      },
      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id)
        }))
    }),
    {
      name: 'app-store'
    }
  )
)