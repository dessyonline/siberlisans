import * as React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { link?: string }

const Email = ({ link = 'https://siberlisans.com' }: Props) => (
  <Html lang="tr" dir="ltr">
    <Head />
    <Preview>Siber Lisans şifre sıfırlama bağlantınız</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Şifre sıfırlama</Heading>
        <Text style={text}>Siber Lisans hesabınız için şifre sıfırlama talebi aldık. Yeni şifrenizi belirlemek için aşağıdaki butona tıklayın.</Text>
        <Button href={link} style={button}>Yeni şifre belirle</Button>
        <Text style={small}>Buton çalışmazsa bu adresi tarayıcınıza yapıştırın: {link}</Text>
        <Text style={small}>Bağlantı 24 saat geçerlidir ve yalnızca bir kez kullanılabilir. Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Siber Lisans şifre sıfırlama bağlantınız',
  displayName: 'Şifre sıfırlama',
  previewData: { link: 'https://siberlisans.com/sifre-belirle?token=abc' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px', maxWidth: '520px' }
const h1 = { fontSize: '20px', color: '#111111', margin: '0 0 16px' }
const text = { fontSize: '14px', lineHeight: '22px', color: '#111111' }
const small = { fontSize: '12px', lineHeight: '20px', color: '#555555', wordBreak: 'break-all' as const }
const button = { backgroundColor: '#00c27a', color: '#0b0f0d', padding: '12px 20px', borderRadius: '6px', fontSize: '14px', textDecoration: 'none' }
