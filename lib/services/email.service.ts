export interface EmailService {
  send(to: string, subject: string, body: string): Promise<void>
}

export class EmailServiceImpl implements EmailService {
  async send(to: string, subject: string, body: string): Promise<void> {
    // Email sending implementation
    console.log('Sending email to:', to)
  }
}

export const emailService = new EmailServiceImpl()