export interface NotificationService {
  sendNotification(message: string, type: 'info' | 'success' | 'warning' | 'error'): Promise<void>;
  getNotifications(): Promise<any[]>;
  markAsRead(id: string): Promise<void>;
}

export class NotificationServiceImpl implements NotificationService {
  async sendNotification(message: string, type: 'info' | 'success' | 'warning' | 'error') {
    // Implementation for sending notifications
    console.log('Notification:', { message, type });
  }

  async getNotifications() {
    const response = await fetch('/api/notifications');
    return response.json();
  }

  async markAsRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
  }
}

export const notificationService = new NotificationServiceImpl();