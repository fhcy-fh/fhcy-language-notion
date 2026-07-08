import { NextRequest, NextResponse } from 'next/server'
import { ApiResult } from '@/src/types/CommonTypes'
import { Client } from '@notionhq/client'
import { WordType } from '@/src/types/WordTypes'
import { wordCache } from '@/src/app/api/notion/cache'

interface BatchQueryRequestBody {
  id: string
}

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
})
export async function POST(req: NextRequest) {
  try {
    const body: BatchQueryRequestBody = await req.json()
    const { id } = body

    if (!id) {
      return NextResponse.json(ApiResult.success())
    }
    const cachedWord = wordCache.get(id)
    if (cachedWord) {
      return NextResponse.json(ApiResult.success(cachedWord))
    }
    const res = await notion.pages.retrieve({ page_id: id })
    const props = (res as any).properties
    if (!props.word?.title || props.word.title.length === 0) return

    const cleanedWord: WordType = {
      id: res.id,
      word: (
        props.word?.title?.[0]?.plain_text ||
        props.word?.rich_text?.[0]?.plain_text ||
        ''
      ).trim(),
      pos: props.pos?.rich_text?.[0]?.plain_text || '',
      phonetic: props.phonetic?.rich_text?.[0]?.plain_text || '',
      definition: props.definition?.rich_text?.[0]?.plain_text || '',
      audio_url:
        props.audio?.files?.[0]?.file?.url ||
        props.audio?.files?.[0]?.external?.url ||
        '',
      image_url:
        props.image?.files?.[0]?.file?.url ||
        props.image?.files?.[0]?.external?.url ||
        '',
    }
    wordCache.set(res.id, cleanedWord)
    return NextResponse.json(ApiResult.success(cleanedWord))
  } catch (error) {
    console.log('error: ' + error)
    return NextResponse.json(
      ApiResult.fail(
        error instanceof Error ? error.message : 'API invocation exception',
      ),
    )
  }
}
