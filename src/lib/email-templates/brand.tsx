import * as React from 'react'

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export const BRAND = {
  name: 'SİBER LİSANS',
  url: 'https://siberlisans.com',
  accent: '#00b978',
  ink: '#0f1512',
  muted: '#5b6560',
  border: '#e3e9e6',
}

export const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  margin: '0',
  padding: '0',
}

export const container = {
  maxWidth: '560px',
  margin: '0 auto',
  padding: '32px 28px 40px',
}

export const brandBar = {
  borderLeft: `3px solid ${BRAND.accent}`,
  paddingLeft: '12px',
  marginBottom: '28px',
}

export const brandName = {
  fontFamily: "'JetBrains Mono', Consolas, monospace",
  fontSize: '15px',
  letterSpacing: '1px',
  color: BRAND.ink,
  fontWeight: 'bold' as const,
  margin: '0',
}

export const h1 = {
  fontSize: '21px',
  fontWeight: 'bold' as const,
  color: BRAND.ink,
  lineHeight: '1.35',
  margin: '0 0 16px',
}

export const text = {
  fontSize: '15px',
  color: BRAND.muted,
  lineHeight: '1.65',
  margin: '0 0 18px',
}

export const button = {
  backgroundColor: BRAND.ink,
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  borderRadius: '10px',
  padding: '13px 26px',
  textDecoration: 'none',
  display: 'inline-block',
}

export const link = { color: BRAND.accent, textDecoration: 'underline' }

export const codeStyle = {
  fontFamily: "'JetBrains Mono', Consolas, monospace",
  fontSize: '28px',
  letterSpacing: '6px',
  fontWeight: 'bold' as const,
  color: BRAND.ink,
  backgroundColor: '#f4f7f5',
  border: `1px solid ${BRAND.border}`,
  borderRadius: '10px',
  padding: '16px 20px',
  textAlign: 'center' as const,
  margin: '0 0 24px',
}

export const hr = {
  borderColor: BRAND.border,
  borderTop: `1px solid ${BRAND.border}`,
  margin: '32px 0 16px',
}

export const footer = {
  fontSize: '12px',
  color: '#98a29d',
  lineHeight: '1.6',
  margin: '0 0 6px',
}

export const fallbackUrl = {
  fontSize: '12px',
  color: '#98a29d',
  wordBreak: 'break-all' as const,
  lineHeight: '1.5',
  margin: '18px 0 0',
}

interface LayoutProps {
  preview: string
  heading: string
  children: React.ReactNode
}

export const EmailLayout = ({ preview, heading, children }: LayoutProps) => (
  <Html lang="tr" dir="ltr">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar}>
          <Text style={brandName}>{BRAND.name}</Text>
        </Section>
        <Heading style={h1}>{heading}</Heading>
        {children}
        <Hr style={hr} />
        <Text style={footer}>
          {BRAND.name} · Dijital lisans ve yazılım çözümleri
        </Text>
        <Text style={footer}>
          Bu e-posta hesap güvenliğinizle ilgili otomatik bir bildirimdir.
        </Text>
      </Container>
    </Body>
  </Html>
)
