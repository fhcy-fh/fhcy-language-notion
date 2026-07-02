import './globals.css'
import { ToastProvider } from '@heroui/react'
import { Metadata } from 'next'
import { HeroUIProvider } from '@heroui/system'
import { getInfo } from '@/src/app/api/notion/base/route'
import { BaseInfoType } from '@/src/types/CommonTypes'

function formatIcon(iconStr: string): string {
  if (!iconStr) return '/favicon.ico' // 兜底默认图标

  // 判断是否是完整的 URL 或相对路径图片（以 http, https, / 开头，或者包含常见图片后缀）
  const isUrl = /^(https?:\/\/|\/)|(\.(ico|png|jpg|jpeg|svg|webp))$/i.test(
    iconStr,
  )

  if (isUrl) {
    return iconStr
  }

  // 如果是 Emoji 或文本，将其包装为 SVG Data URL
  // 使用 <text> 标签在 SVG 中绘制字符，并通过 dynamic 属性使其居中
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <text y=".9em" font-size="90">${iconStr}</text>
  </svg>`

  // 转化为 base64 或 utf8 编码的 Data URL
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export async function generateMetadata(): Promise<Metadata> {
  const baseInfo = (await getInfo()) as BaseInfoType
  // 动态处理从 Notion 拿到的 icon
  const rawIcon = baseInfo?.icon || ''
  const finalIcon = formatIcon(rawIcon)
  return {
    title: baseInfo?.title || 'LANGUAGE',
    description: baseInfo?.description || '',
    icons: {
      icon: finalIcon || '/favicon.ico',
    },
  }
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full w-full">
      <body className="w-full h-full text-slate-900 antialiased m-0 p-0">
        <HeroUIProvider className="w-full h-full">
          <ToastProvider placement="top" />
          <div className="w-full h-full">{children}</div>
        </HeroUIProvider>
      </body>
    </html>
  )
}
