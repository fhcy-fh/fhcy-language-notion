import { LRUCache } from 'lru-cache'
import { WordType } from '@/src/types/WordTypes'
import { BookType } from '@/src/types/BookTypes'

// 💡 1. 导出公共的缓存实例
export const wordCache = new LRUCache<string, WordType>({
  max: 5000,
  ttl: 1000 * 60 * 30, // 每个单词独立缓存 1 小时
  allowStale: false,
})

// book缓存
export const books_key = 'books_key'
export const bookCache = new LRUCache<string, BookType[]>({
  max: 5000,
  ttl: 1000 * 60 * 60 * 24,
  allowStale: false,
})
// word ids 缓存
export const wordIdsCache = new LRUCache<string, string[]>({
  max: 5000,
  ttl: 1000 * 60 * 60,
  allowStale: false,
})

// base缓存
export const baseCache = new LRUCache<string, string>({
  max: 5000,
  ttl: 1000 * 60 * 60 * 24 * 7,
  allowStale: false,
})
