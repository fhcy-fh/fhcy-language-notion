export interface WordType {
  id: string // 单词拼写
  word: string // 单词拼写
  pos: string // 词性
  phonetic: string // 音标
  definition: string // 释义
  audio_url: string // 发音音频链接
  image_url: string // 辅助记忆图片链接
}
export const InitWordType: WordType = {
  id: '',
  word: '',
  pos: '',
  phonetic: '',
  definition: '',
  audio_url: '',
  image_url: '',
}
