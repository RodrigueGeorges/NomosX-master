
"use client";
import React from 'react';
import { useState } from 'react';
/**
 * Settings Client - Composant client pour les paramètres
 * Suivi de la charte graphique OpenClaw
 */


import { Card,CardContent,CardDescription,CardHeader,CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { Badge } from '@/components/ui/Badge';
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle,DialogTrigger } from '@/components/ui/Dialog';
import { Settings,Database,Mail,Shield,Globe,Bell,Palette,Zap,AlertTriangle,CheckCircle,XCircle,Clock,Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SystemSettings {
  general: {
    siteName: string
    siteDescription: string
    contactEmail: string
    supportEmail: string
    defaultLanguage: string
    defaultTimezone: string
  }
  email: {
    provider: 'resend' | 'sendgrid' | 'smtp'
    fromEmail: string;
fromName: string
    replyTo: string
    smtpHost?: string
    smtpPort?: number
    smtpUser?: string
    smtpPassword?: string
  }
  security: {
    twoFactorEnabled: boolean
    sessionTimeout: number
    maxLoginAttempts: number
    lockoutDuration: number
    passwordMinLength: number
    requireEmailVerification: boolean
  }
  notifications: {
    emailNotifications: boolean
    pushNotifications: boolean
    newsletterEnabled: boolean
    marketingEmails: boolean
    securityAlerts: boolean
  }
  features: {
    betaFeatures: boolean
    advancedAnalytics: boolean
    customBranding: boolean
    apiAccess: boolean
    integrations: boolean
  }
}

export function SettingsClient() {
  const [settings, setSettings] = useState<SystemSettings>({
    general: {
      siteName: 'NomosX',
      siteDescription: 'Artificial Intelligence for Think Tanks',
      contactEmail: 'contact@nomosx.ai',
      supportEmail: 'support@nomosx.ai',
      defaultLanguage: 'fr',
      defaultTimezone: 'Europe/Paris'
    },
    email: {
      provider: 'resend',
      fromEmail: 'noreply@nomosx.ai',
      fromName: 'NomosX',
      replyTo: 'support@nomosx.ai'
    },
    security: {
      twoFactorEnabled: true,
      sessionTimeout: 24,
      maxLoginAttempts: 5,
      lockoutDuration: 15,
      passwordMinLength: 8,
      requireEmailVerification: true
    },
    notifications: {
      emailNotifications: true,
      pushNotifications: true,
      newsletterEnabled: true,
      marketingEmails: false,
      securityAlerts: true
    },
    features: {
      betaFeatures: false,
      advancedAnalytics: true,
      customBranding: false,
      apiAccess: true,
      integrations: true
    }
  })

  const [activeTab, setActiveTab] = useState<'general' | 'email' | 'security' | 'notifications' | 'features'>('general')
  const [saving, setSaving] = useState(false)
  const [showRestartDialog, setShowRestartDialog] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      // Logique de sauvegarde
      await new Promise(resolve => setTimeout(resolve, 1500))
    } catch (error) {
      console.error('Error saving settings:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleRestart = async () => {
    setShowRestartDialog(false)
    // Logique de redémarrage
    // System restart initiated
  }

  const updateSetting = (category: keyof SystemSettings, key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: value
      }
    }))
  }

  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'email', label: 'Email', icon: Mail },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'features', label: 'Features', icon: Zap }
  ] as const

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="border-b">
        <nav className="flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 py-2 px-1 border-b-2 transition-colors",
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-neutral-600 hover:text-neutral-900"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {/* General Settings */}
        {activeTab === 'general' && (
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>
                Configure the basic information for your platform
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="siteName">Site Name</Label>
                  <Input
                    id="siteName"
                    value={settings.general.siteName}
                    onChange={(e) => updateSetting('general', 'siteName', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="contactEmail">Contact Email</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    value={settings.general.contactEmail}
                    onChange={(e) => updateSetting('general', 'contactEmail', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="supportEmail">Support Email</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={settings.general.supportEmail}
                    onChange={(e) => updateSetting('general', 'supportEmail', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="defaultLanguage">Default Language</Label>
                  <Select value={settings.general.defaultLanguage} onValueChange={(value) => updateSetting('general', 'defaultLanguage', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="siteDescription">Site Description</Label>
                <Textarea
                  id="siteDescription"
                  value={settings.general.siteDescription}
                  onChange={(e) => updateSetting('general', 'siteDescription', e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Email Settings */}
        {activeTab === 'email' && (
          <Card>
            <CardHeader>
              <CardTitle>Email Configuration</CardTitle>
              <CardDescription>
                Configure your email sending settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="emailProvider">Email Provider</Label>
                  <Select value={settings.email.provider} onValueChange={(value) => updateSetting('email', 'provider', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="resend">Resend</SelectItem>
                      <SelectItem value="sendgrid">SendGrid</SelectItem>
                      <SelectItem value="smtp">SMTP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="fromEmail">From Email</Label>
                  <Input
                    id="fromEmail"
                    type="email"
                    value={settings.email.fromEmail}
                    onChange={(e) => updateSetting('email', 'fromEmail', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="fromName">From Name</Label>
                  <Input
                    id="fromName"
                    value={settings.email.fromName}
                    onChange={(e) => updateSetting('email', 'fromName', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="replyTo">Reply-To Email</Label>
                  <Input
                    id="replyTo"
                    type="email"
                    value={settings.email.replyTo}
                    onChange={(e) => updateSetting('email', 'replyTo', e.target.value)}
                  />
                </div>
              </div>
              
              {settings.email.provider === 'smtp' && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-4">SMTP Configuration</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="smtpHost">SMTP Host</Label>
                      <Input
                        id="smtpHost"
                        value={settings.email.smtpHost || ''}
                        onChange={(e) => updateSetting('email', 'smtpHost', e.target.value)}
                        placeholder="smtp.example.com"
                      />
                    </div>
                    <div>
                      <Label htmlFor="smtpPort">SMTP Port</Label>
                      <Input
                        id="smtpPort"
                        type="number"
                        value={settings.email.smtpPort || ''}
                        onChange={(e) => updateSetting('email', 'smtpPort', parseInt(e.target.value))}
                        placeholder="587"
                      />
                    </div>
                    <div>
                      <Label htmlFor="smtpUser">SMTP User</Label>
                      <Input
                        id="smtpUser"
                        value={settings.email.smtpUser || ''}
                        onChange={(e) => updateSetting('email', 'smtpUser', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="smtpPassword">SMTP Password</Label>
                      <Input
                        id="smtpPassword"
                        type="password"
                        value={settings.email.smtpPassword || ''}
                        onChange={(e) => updateSetting('email', 'smtpPassword', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-indigo-400" />
                  <div>
                    <div className="font-medium">Test email</div>
                    <div className="text-sm text-white/40">Send a test email to verify your configuration</div>
                  </div>
                </div>
                <Button variant="outline">Send test</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Security Settings */}
        {activeTab === 'security' && (
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>
                Configure the security options for your platform
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Two-factor authentication</div>
                    <div className="text-sm text-neutral-600">Require 2FA for all users</div>
                  </div>
                  <Switch
                    checked={settings.security.twoFactorEnabled}
                    onCheckedChange={(checked) => updateSetting('security', 'twoFactorEnabled', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Mandatory email verification</div>
                    <div className="text-sm text-neutral-600">Users must verify their email address</div>
                  </div>
                  <Switch
                    checked={settings.security.requireEmailVerification}
                    onCheckedChange={(checked) => updateSetting('security', 'requireEmailVerification', checked)}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="sessionTimeout">Session timeout (hours)</Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    value={settings.security.sessionTimeout}
                    onChange={(e) => updateSetting('security', 'sessionTimeout', parseInt(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="maxLoginAttempts">Max login attempts</Label>
                  <Input
                    id="maxLoginAttempts"
                    type="number"
                    value={settings.security.maxLoginAttempts}
                    onChange={(e) => updateSetting('security', 'maxLoginAttempts', parseInt(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="lockoutDuration">Lockout duration (minutes)</Label>
                  <Input
                    id="lockoutDuration"
                    type="number"
                    value={settings.security.lockoutDuration}
                    onChange={(e) => updateSetting('security', 'lockoutDuration', parseInt(e.target.value))}
                  />
                </div>
                <div>
                  <Label htmlFor="passwordMinLength">Min. password length</Label>
                  <Input
                    id="passwordMinLength"
                    type="number"
                    value={settings.security.passwordMinLength}
                    onChange={(e) => updateSetting('security', 'passwordMinLength', parseInt(e.target.value))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notification Settings */}
        {activeTab === 'notifications' && (
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>
                Configure system and marketing notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Email notifications</div>
                    <div className="text-sm text-neutral-600">Enable email notifications</div>
                  </div>
                  <Switch
                    checked={settings.notifications.emailNotifications}
                    onCheckedChange={(checked) => updateSetting('notifications', 'emailNotifications', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Push notifications</div>
                    <div className="text-sm text-neutral-600">Enable push notifications</div>
                  </div>
                  <Switch
                    checked={settings.notifications.pushNotifications}
                    onCheckedChange={(checked) => updateSetting('notifications', 'pushNotifications', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Newsletter</div>
                    <div className="text-sm text-neutral-600">Allow newsletters</div>
                  </div>
                  <Switch
                    checked={settings.notifications.newsletterEnabled}
                    onCheckedChange={(checked) => updateSetting('notifications', 'newsletterEnabled', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Marketing emails</div>
                    <div className="text-sm text-neutral-600">Send promotional emails</div>
                  </div>
                  <Switch
                    checked={settings.notifications.marketingEmails}
                    onCheckedChange={(checked) => updateSetting('notifications', 'marketingEmails', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Security alerts</div>
                    <div className="text-sm text-neutral-600">Notify on suspicious activity</div>
                  </div>
                  <Switch
                    checked={settings.notifications.securityAlerts}
                    onCheckedChange={(checked) => updateSetting('notifications', 'securityAlerts', checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Feature Settings */}
        {activeTab === 'features' && (
          <Card>
            <CardHeader>
              <CardTitle>Features</CardTitle>
              <CardDescription>
                Enable or disable platform features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Beta features</div>
                    <div className="text-sm text-neutral-600">Access to experimental features</div>
                  </div>
                  <Switch
                    checked={settings.features.betaFeatures}
                    onCheckedChange={(checked) => updateSetting('features', 'betaFeatures', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Advanced analytics</div>
                    <div className="text-sm text-neutral-600">Detailed reports and advanced analysis</div>
                  </div>
                  <Switch
                    checked={settings.features.advancedAnalytics}
                    onCheckedChange={(checked) => updateSetting('features', 'advancedAnalytics', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Custom branding</div>
                    <div className="text-sm text-neutral-600">Interface customization</div>
                  </div>
                  <Switch
                    checked={settings.features.customBranding}
                    onCheckedChange={(checked) => updateSetting('features', 'customBranding', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">API access</div>
                    <div className="text-sm text-neutral-600">REST API and webhooks</div>
                  </div>
                  <Switch
                    checked={settings.features.apiAccess}
                    onCheckedChange={(checked) => updateSetting('features', 'apiAccess', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Integrations</div>
                    <div className="text-sm text-neutral-600">Third-party integrations</div>
                  </div>
                  <Switch
                    checked={settings.features.integrations}
                    onCheckedChange={(checked) => updateSetting('features', 'integrations', checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Save Button */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setShowRestartDialog(true)}>
            Restart system
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save settings'}
          </Button>
        </div>
      </div>

      {/* Restart Dialog */}
      <Dialog open={showRestartDialog} onOpenChange={setShowRestartDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restart system</DialogTitle>
            <DialogDescription>
              Are you sure you want to restart the system? This will cause a temporary service interruption.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-300">Warning</p>
                  <p className="text-yellow-400/80 mt-1">
                    The restart will take approximately 2-3 minutes. During this time, the platform will be unavailable.
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowRestartDialog(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleRestart}>
                Restart
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
