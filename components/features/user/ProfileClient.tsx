
"use client";
import React from 'react';
import { useState } from 'react';
/**
 * Profile Client - Composant client pour le profil utilisateur
 * Suivi de la charte graphique OpenClaw
 */


import { Card,CardContent,CardDescription,CardHeader,CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle,DialogTrigger } from '@/components/ui/Dialog';
import { User,Mail,Phone,Building,Calendar,Shield,Bell,Globe,Palette } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserProfile {
  id: string
  email: string
  name: string
  firstName: string
  lastName: string
  phone?: string
  company?: string
  jobTitle?: string
  timezone: string
  language: string
  avatar?: string
  role: 'user' | 'admin' | 'superadmin'
  plan: 'free' | 'professional' | 'enterprise' | 'custom'
  emailVerified: boolean
  createdAt: Date
  lastLoginAt: Date
}

interface NotificationSettings {
  email: boolean
  push: boolean
  newsletter: boolean
  updates: boolean
  security: boolean
  marketing: boolean
}

interface Preferences {
  theme: 'light' | 'dark' | 'system'
  language: string
  timezone: string
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
  timeFormat: '24h' | '12h'
}

export function ProfileClient() {
  const [profile] = useState<UserProfile>({
    id: 'user_1234567890',
    email: 'jean.dupont@nomosx.ai',
    name: 'Jean Dupont',
    firstName: 'Jean',
    lastName: 'Dupont',
    phone: '+33 6 12 34 56 78',
    company: 'NomosX Corp',
    jobTitle: 'Director of Research',
    timezone: 'Europe/Paris',
    language: 'fr',
    role: 'admin',
    plan: 'professional',
    emailVerified: true,
    createdAt: new Date('2023-01-15'),
    lastLoginAt: new Date('2024-01-20')
  })

  const [notifications, setNotifications] = useState<NotificationSettings>({
    email: true,
    push: true,
    newsletter: true,
    updates: true,
    security: true,
    marketing: false
  })

  const [preferences, setPreferences] = useState<Preferences>({
    theme: 'system',
    language: 'fr',
    timezone: 'Europe/Paris',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h'
  })

  const [editingProfile, setEditingProfile] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      // Logique de sauvegarde
      await new Promise(resolve => setTimeout(resolve, 1500))
      setEditingProfile(false)
    } catch (error) {
      console.error('Error saving profile:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleNotificationChange = (key: keyof NotificationSettings, value: boolean) => {
    setNotifications(prev => ({ ...prev, [key]: value }))
  }

  const handlePreferenceChange = (key: keyof Preferences, value: string) => {
    setPreferences(prev => ({ ...prev, [key]: value }))
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date)
  }

  const getPlanColor = (plan: string) => {
    switch (plan) {
      case 'free':
        return 'bg-white/10 text-white/50'
      case 'professional':
        return 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
      case 'enterprise':
        return 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
      case 'custom':
        return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
      default:
        return 'bg-white/10 text-white/50'
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'user':
        return 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
      case 'admin':
        return 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
      case 'superadmin':
        return 'bg-red-500/20 text-red-300 border border-red-500/30'
      default:
        return 'bg-white/10 text-white/50'
    }
  }

  return (
    <div className="space-y-6">
      {/* Profile Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
              <CardDescription>
                Manage your basic information
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={getPlanColor(profile.plan)}>
                {profile.plan.charAt(0).toUpperCase() + profile.plan.slice(1)}
              </Badge>
              <Badge className={getRoleColor(profile.role)}>
                {profile.role === 'superadmin' ? 'Super Admin' : 
                 profile.role === 'admin' ? 'Admin' : 'User'}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {editingProfile ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  defaultValue={profile.firstName}
                  placeholder="Your first name"
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  defaultValue={profile.lastName}
                  placeholder="Your last name"
                />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  defaultValue={profile.email}
                  disabled
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  defaultValue={profile.phone}
                  placeholder="Your phone number"
                />
              </div>
              <div>
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  defaultValue={profile.company}
                  placeholder="Your company"
                />
              </div>
              <div>
                <Label htmlFor="jobTitle">Job Title</Label>
                <Input
                  id="jobTitle"
                  defaultValue={profile.jobTitle}
                  placeholder="Your job title"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select defaultValue={profile.timezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Europe/Paris">Europe/Paris</SelectItem>
                    <SelectItem value="America/New_York">America/New_York</SelectItem>
                    <SelectItem value="Asia/Tokyo">Asia/Tokyo</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-neutral-500" />
                  <div>
                    <div className="font-medium">{profile.email}</div>
                    <div className="text-sm text-neutral-600">Email</div>
                  </div>
                  {profile.emailVerified && (
                    <Badge variant="secondary" className="text-green-600">
                      Verified
                    </Badge>
                  )}
                </div>
                {profile.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-5 w-5 text-neutral-500" />
                    <div>
                      <div className="font-medium">{profile.phone}</div>
                      <div className="text-sm text-neutral-600">Phone</div>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-neutral-500" />
                  <div>
                    <div className="font-medium">{profile.name}</div>
                    <div className="text-sm text-neutral-600">Full name</div>
                  </div>
                </div>
                {profile.company && (
                  <div className="flex items-center gap-3">
                    <Building className="h-5 w-5 text-neutral-500" />
                    <div>
                      <div className="font-medium">{profile.company}</div>
                      <div className="text-sm text-neutral-600">Company</div>
                    </div>
                  </div>
                )}
              </div>
              <div className="md:col-span-2 space-y-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-neutral-500" />
                  <div>
                    <div className="font-medium">Member since {formatDate(profile.createdAt)}</div>
                    <div className="text-sm text-neutral-600">Last login: {formatDate(profile.lastLoginAt)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div className="flex gap-3 pt-4 border-t">
            {editingProfile ? (
              <>
                <Button onClick={handleSaveProfile} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
                <Button variant="outline" onClick={() => setEditingProfile(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button onClick={() => setEditingProfile(true)}>
                Edit Profile
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
          <CardDescription>
            Manage your notification preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(notifications).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <div className="font-medium capitalize">
                  {key === 'email' ? 'Emails' :
                   key === 'push' ? 'Push notifications' :
                   key === 'newsletter' ? 'Newsletter' :
                   key === 'updates' ? 'Product updates' :
                   key === 'security' ? 'Security alerts' :
                   key === 'marketing' ? 'Marketing' : key}
                </div>
                <div className="text-sm text-neutral-600">
                  {key === 'email' ? 'Receive notifications by email' :
                   key === 'push' ? 'Receive push notifications in the browser' :
                   key === 'newsletter' ? 'Receive the weekly newsletter' :
                   key === 'updates' ? 'Be notified of new features' :
                   key === 'security' ? 'Important security alerts' :
                   key === 'marketing' ? 'Promotional and marketing offers' : ''}
                </div>
              </div>
              <button
                onClick={() => handleNotificationChange(key as keyof NotificationSettings, !value)}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  value ? "bg-primary" : "bg-neutral-200"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    value ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Preferences
          </CardTitle>
          <CardDescription>
            Customize your experience
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Theme</Label>
              <Select value={preferences.theme} onValueChange={(value) => handlePreferenceChange('theme', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Language</Label>
              <Select value={preferences.language} onValueChange={(value) => handlePreferenceChange('language', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date Format</Label>
              <Select value={preferences.dateFormat} onValueChange={(value) => handlePreferenceChange('dateFormat', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Time Format</Label>
              <Select value={preferences.timeFormat} onValueChange={(value) => handlePreferenceChange('timeFormat', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">24-hour</SelectItem>
                  <SelectItem value="12h">12-hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Security
          </CardTitle>
          <CardDescription>
            Manage your account security
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <div className="font-medium">Password</div>
                <div className="text-sm text-neutral-600">Last changed: 3 months ago</div>
              </div>
              <Button variant="outline">Change</Button>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <div className="font-medium">Two-factor authentication</div>
                <div className="text-sm text-neutral-600">Not configured</div>
              </div>
              <Button variant="outline">Configure</Button>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <div className="font-medium">Active sessions</div>
                <div className="text-sm text-neutral-600">3 active sessions</div>
              </div>
              <Button variant="outline">Manage</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
