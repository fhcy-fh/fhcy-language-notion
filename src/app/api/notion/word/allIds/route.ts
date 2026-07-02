import { NextRequest, NextResponse } from 'next/server'
import { ApiResult } from '@/src/types/CommonTypes'
import { Client } from '@notionhq/client'
import { wordCache, wordIdsCache } from '@/src/app/api/notion/cache'
import { WordType } from '@/src/types/WordTypes'

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
})

export async function getWordIds(data_source_id: string) {
  const wordIds: string[] = []
  let hasMore = true
  let startCursor: string | undefined = undefined

  while (hasMore) {
    // 每次请求传入当前的 cursor
    const response = await notion.dataSources.query({
      data_source_id: data_source_id,
      start_cursor: startCursor,
    })

    // 处理当前页的数据
    const pageIds = (response.results as any[]).flatMap((page) => {
      const props = page.properties

      // 核心防御：如果 word 为空，直接返回空数组 []
      if (!props.word?.title || props.word.title.length === 0) {
        return []
      }
      const cleanedWord: WordType = {
        id: page.id,
        word:
          props.word?.title?.[0]?.plain_text ||
          props.word?.rich_text?.[0]?.plain_text ||
          '',
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
      // 💡 4. 将查出来的最新数据塞入缓存，方便下次使用
      wordCache.set(page.id, cleanedWord)
      return page.id
    })

    // 将当前页拿到的 id 合并到总数组中
    wordIds.push(...pageIds)

    // 更新分页状态
    hasMore = response.has_more
    startCursor = response.next_cursor ?? undefined
  }

  return wordIds
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const data_source_id = searchParams.get('data_source_id')

    if (!data_source_id) {
      return NextResponse.json(ApiResult.fail('Missing target datasource id'))
    }
    if (wordIdsCache.has(data_source_id)) {
      console.log('books cache hit')
      return NextResponse.json(
        ApiResult.success(wordIdsCache.get(data_source_id)),
      )
    }
    const wordIds: string[] = await getWordIds(data_source_id)

    return NextResponse.json(ApiResult.success(wordIds))
  } catch (error) {
    console.log('error: ' + error)
    return NextResponse.json(
      ApiResult.fail(
        error instanceof Error ? error.message : 'API invocation exception',
      ),
    )
  }
}
