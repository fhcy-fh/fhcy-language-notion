import { NextResponse } from 'next/server'
import { ApiResult, BaseInfoType } from '@/src/types/CommonTypes'
import { Client } from '@notionhq/client'
import { baseCache } from '@/src/app/api/notion/cache'

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
})

export async function getInfo() {
  const data_source_id = process.env.NOTION_DATA_SOURCE_ID || ''
  if (data_source_id == '') {
    return {}
  }
  let title = ''
  let description = ''
  let icon = ''
  if (baseCache.has('title')) title = baseCache.get('title') as string
  if (baseCache.has('description'))
    description = baseCache.get('description') as string
  if (baseCache.has('icon')) icon = baseCache.get('icon') as string
  if (title != '' && description != '') {
    return {
      title: title,
      description: description,
      icon: icon,
    } as BaseInfoType
  }

  const response = await notion.dataSources.retrieve({
    data_source_id: data_source_id,
  })
  const rawResponse = response as any
  const baseInfo = {
    title: rawResponse?.title?.[0]?.plain_text || '',
    description: rawResponse?.description?.[0]?.plain_text || '',
    icon: rawResponse?.icon?.custom_emoji?.url || '',
  } as BaseInfoType
  if (baseInfo.icon == '') {
    baseInfo.icon = rawResponse?.icon?.emoji || ''
  }
  baseCache.set('title', baseInfo.title)
  baseCache.set('description', baseInfo.description)
  baseCache.set('icon', baseInfo.icon)
  return baseInfo
}

export async function GET() {
  try {
    const baseInfo = (await getInfo()) as BaseInfoType
    return NextResponse.json(ApiResult.success(baseInfo))
  } catch (error) {
    console.log('error: ' + error)
    return NextResponse.json(
      ApiResult.fail(
        error instanceof Error ? error.message : 'API invocation exception',
      ),
    )
  }
}
