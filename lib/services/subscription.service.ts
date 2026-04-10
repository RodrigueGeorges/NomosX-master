export interface SubscriptionService {
  createSubscription(planId: string): Promise<any>;
  getSubscription(): Promise<any>;
  updateSubscription(planId: string): Promise<any>;
  cancelSubscription(): Promise<void>;
}

export class SubscriptionServiceImpl implements SubscriptionService {
  async createSubscription(planId: string) {
    const response = await fetch('/api/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId })
    });
    return response.json();
  }

  async getSubscription() {
    const response = await fetch('/api/subscription');
    return response.json();
  }

  async updateSubscription(planId: string) {
    const response = await fetch('/api/subscription', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId })
    });
    return response.json();
  }

  async cancelSubscription() {
    await fetch('/api/subscription', { method: 'DELETE' });
  }
}

export const subscriptionService = new SubscriptionServiceImpl();