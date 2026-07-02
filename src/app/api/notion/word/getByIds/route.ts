import { NextRequest, NextResponse } from 'next/server'
import { ApiResult } from '@/src/types/CommonTypes'
import { Client } from '@notionhq/client'
import { WordType } from '@/src/types/WordTypes'
import { wordCache } from '@/src/app/api/notion/cache'

interface BatchQueryRequestBody {
  data_source_id: string
  ids: string[]
}

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
})
export async function POST(req: NextRequest) {
  try {
    const body: BatchQueryRequestBody = await req.json()
    const { ids } = body

    if (!ids || ids.length === 0) {
      return NextResponse.json(ApiResult.success([]))
    }
    const finalWords: WordType[] = []
    const missingIds: string[] = []

    for (const id of ids) {
      const cachedWord = wordCache.get(id)
      if (cachedWord) {
        finalWords.push(cachedWord) // 命中缓存，直接加入结果集
      } else {
        missingIds.push(id) // 未命中，记录下来准备查 Notion
      }
    }

    if (missingIds.length > 0) {
      const pagePromises = missingIds.map((id) =>
        notion.pages.retrieve({ page_id: id }).catch(() => null),
      )
      const pageResults = await Promise.all(pagePromises)

      // 数据清洗与“脱水”
      pageResults.forEach((page: any) => {
        if (!page || !page.properties) return

        const props = page.properties
        if (!props.word?.title || props.word.title.length === 0) return

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

        // 压入本次请求的返回集
        finalWords.push(cleanedWord)
      })
    } // 💡 5. 为了保持返回的顺序和传入的 ids 一致（可选，但推荐，方便前端对应）
    const sortedResult = ids
      .map((id) => finalWords.find((w) => w.id === id))
      .filter((w): w is WordType => !!w)
    // 4. 返回绝对干净、无多余字段且只包含传入 ID 的结果集
    return NextResponse.json(ApiResult.success(sortedResult))
  } catch (error) {
    console.log('error: ' + error)
    return NextResponse.json(
      ApiResult.fail(
        error instanceof Error ? error.message : 'API invocation exception',
      ),
    )
  }
}
