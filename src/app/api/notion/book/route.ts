import { NextResponse } from 'next/server'
import { ApiResult } from '@/src/types/CommonTypes'
import { Client } from '@notionhq/client'
import { BookType } from '@/src/types/BookTypes'
import { bookCache, books_key } from '@/src/app/api/notion/cache'

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
})
export async function GET() {
  try {
    const data_source_id = process.env.NOTION_DATA_SOURCE_ID || ''
    if (data_source_id == '') {
      return NextResponse.json(ApiResult.fail('System Config Error'))
    }
    if (bookCache.has(books_key)) {
      console.log('books cache hit')
      return NextResponse.json(ApiResult.success(bookCache.get(books_key)))
    }

    const response = await notion.dataSources.query({
      data_source_id: data_source_id,
      sorts: [
        {
          property: 'sort', // 你的字段名称
          direction: 'ascending', // 升序：'ascending' 或 降序：'descending'
        },
      ],
    })
    const books: BookType[] = (response.results as any[]).map((page) => {
      const props = page.properties
      return {
        id: page.id,
        name:
          props.name?.title?.[0]?.plain_text ||
          props.name?.rich_text?.[0]?.plain_text ||
          '',
        data_source_id: props.data_source_id?.rich_text?.[0]?.plain_text || '',
        description: props.description?.rich_text?.[0]?.plain_text || '',
        icon:
          props.icon?.files?.[0]?.file?.url ||
          props.icon?.files?.[0]?.external?.url ||
          '',
      }
    })
    bookCache.set(books_key, books)
    return NextResponse.json(ApiResult.success(books))
  } catch (error) {
    console.log('error: ' + error)
    return NextResponse.json(
      ApiResult.fail(
        error instanceof Error ? error.message : 'API invocation exception',
      ),
    )
  }
}
