'use client'

import React, { use, useCallback, useEffect, useRef, useState } from 'react'
import { Button, Spinner } from '@heroui/react'
import { House } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { WordType } from '@/src/types/WordTypes'
import {
  NotionWordAllIdsByImgClient,
  NotionWordGetByIdsClient,
} from '@/src/client/WordClient'

interface WordMatchItem {
  id: string // 🌟 匹配必须使用确定的数字 id，去掉 undefined
  type: 'text' | 'image'
  word: WordType
}

const globalAudio = typeof window !== 'undefined' ? new Audio() : null

export default function WordMatchPage({
  params,
}: {
  params: Promise<{ dataSourceId: string }>
}) {
  const { dataSourceId } = use(params)
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)

  // 如果处于电脑端（窗口宽 >= 768px），一关放 10 个单词（20张卡片）；手机端放 5 个单词（10张卡片）
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
  const limitCount = isDesktop ? 10 : 5

  const [ids, setIds] = useState<string[]>()

  // 🎮 核心数据池
  const [currentWords, setCurrentWords] = useState<WordMatchItem[]>([])
  const [nextWords, setNextWords] = useState<WordMatchItem[]>([])

  // 🎯 消除游戏互动状态
  const [selectedCard, setSelectedCard] = useState<WordMatchItem | null>(null)
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set())
  const [correctKeys, setCorrectKeys] = useState<Set<string>>(new Set()) // 🌟 新增：记录处于“选对高亮”状态的卡片Key
  const [errorKeys, setErrorKeys] = useState<Set<string>>(new Set()) // 用于记录当前震动闪红的卡片键

  // 音频缓存池，用于预加载
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map())

  // 🎵 预加载音频函数
  const preloadAudios = useCallback((items: WordMatchItem[]) => {
    if (typeof window === 'undefined') return
    items.forEach((item) => {
      const url = item.word?.audio_url
      if (url && !audioCache.current.has(url)) {
        const audio = new Audio()
        audio.preload = 'auto'
        audio.src = url
        audioCache.current.set(url, audio)
      }
    })
  }, [])

  // 数据包装器
  const toWordMatchItem = (wordList: WordType[]): WordMatchItem[] => {
    if (!wordList || wordList.length === 0) return []
    const textItems: WordMatchItem[] = wordList.map((word) => ({
      id: word.id as string,
      type: 'text',
      word: word,
    }))
    const imageItems: WordMatchItem[] = wordList.map((word) => ({
      id: word.id as string,
      type: 'image',
      word: word,
    }))
    return [...textItems, ...imageItems].sort(() => Math.random() - 0.5)
  }

  // 获取下一轮数据并缓存
  const fetchNextWords = useCallback(
    async (ids: string[]) => {
      if (!ids || ids.length === 0) return
      const shuffled = [...ids]

      // Fisher-Yates 洗牌算法
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]] // 交换元素
      }
      // 截取前 limitCount 个元素
      const nextIds = shuffled.slice(0, limitCount)
      const res = await NotionWordGetByIdsClient(nextIds)
      if (res.code === 200) {
        const items = toWordMatchItem(res.data || [])
        setNextWords(items)
        preloadAudios(items) // 🌟 预加载下一轮音频
      }
    },
    [limitCount, preloadAudios],
  )

  // 获取下一轮数据并缓存
  const fetchCurrentWords = useCallback(
    async (ids: string[]) => {
      if (!ids || ids.length === 0) return
      const shuffled = [...ids]

      // Fisher-Yates 洗牌算法
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]] // 交换元素
      }
      // 截取前 limitCount 个元素
      const nextIds = shuffled.slice(0, limitCount)
      const res = await NotionWordGetByIdsClient(nextIds)
      if (res.code === 200) {
        const items = toWordMatchItem(res.data || [])
        setCurrentWords(items)
        preloadAudios(items) // 🌟 预加载当前轮音频
      }
    },
    [limitCount, preloadAudios],
  )

  useEffect(() => {
    const initGameData = async () => {
      try {
        setIsLoading(true)
        setIds([])
        const res = await NotionWordAllIdsByImgClient(dataSourceId)

        if (res.code === 200) {
          const ids = res.data as string[]
          setIds(ids)

          await fetchCurrentWords(ids)
          await fetchNextWords(ids)
        }
      } catch (error) {
        console.error('初始化游戏失败:', error)
      } finally {
        setIsLoading(false)
      }
    }
    void initGameData()
  }, [dataSourceId, fetchCurrentWords, fetchNextWords])

  // 🖱️ 点击卡片处理逻辑
  const handleCardClick = (item: WordMatchItem) => {
    const itemKey = item.id + item.type

    // 拦截：如果是已消除的、处于绿色正确态的、处于错误动画的、或重复点击已选中的，直接返回
    if (
      matchedIds.has(item.id) ||
      correctKeys.has(itemKey) ||
      errorKeys.has(itemKey) ||
      selectedCard === item
    ) {
      return
    }

    // 1. 如果还没点第一个，直接记录当前选中的卡片
    if (!selectedCard) {
      setSelectedCard(item)
      return
    }

    // 2. 如果连续点了相同类型的卡片（比如两个都是单词），则切换第一把的选择
    if (selectedCard.type === item.type) {
      setSelectedCard(item)
      return
    }

    // 3. 此时说明选中了一个单词和一个图片，开始进行匹配判定
    const selectedKey = selectedCard.id + selectedCard.type

    if (selectedCard.id === item.id) {
      // ✅ 配对成功：先置入正确高亮集合，展示配对成功的视觉效果
      const matchedId = item.id
      setCorrectKeys(new Set([selectedKey, itemKey]))
      setSelectedCard(null) // 清空选中态

      // 🌟 延迟 450ms 后再消失卡片
      setTimeout(() => {
        setMatchedIds((prev) => {
          const newMatched = new Set(prev)
          newMatched.add(matchedId)

          // 检测是否本关全部消除
          if (newMatched.size === currentWords.length / 2) {
            setTimeout(() => {
              setCurrentWords(nextWords)
              setMatchedIds(new Set())
              setSelectedCard(null)
              void fetchNextWords(ids || [])
            }, 200)
          }
          return newMatched
        })

        // 清除正确高亮状态
        setCorrectKeys((prev) => {
          const newKeys = new Set(prev)
          newKeys.delete(selectedKey)
          newKeys.delete(itemKey)
          return newKeys
        })
      }, 450)
    } else {
      // ❌ 配对失败
      setErrorKeys(new Set([selectedKey, itemKey]))
      setSelectedCard(null) // 立即释放选择锁定

      // 动画结束后，清除错误标记以恢复常态
      setTimeout(() => {
        setErrorKeys(new Set())
      }, 500)
    }
  }

  // 记录音频是否已经被 iOS 激活过
  const playAudioIsActivated = useRef(false)
  const activateAudioForIOS = useCallback(() => {
    if (playAudioIsActivated.current || !globalAudio) return
    globalAudio.src =
      'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=='
    globalAudio
      .play()
      .then(() => {
        playAudioIsActivated.current = true
      })
      .catch(() => {})
  }, [])

  const playAudio = useCallback(
    (audio_url: string) => {
      if (!audio_url || !globalAudio) return
      if (globalAudio.src === audio_url && !globalAudio.paused) {
        globalAudio.play().catch(() => {})
        return
      }
      if (globalAudio.src === audio_url) {
        globalAudio.play().catch(() => {})
        return
      }
      activateAudioForIOS()
      globalAudio.src = audio_url
      globalAudio.load()
      globalAudio.play().catch(() => {})
    },
    [activateAudioForIOS],
  )

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-neutral-50">
        <Spinner color="current" />
      </div>
    )
  }

  return (
    <div className="w-full h-full mx-auto bg-neutral-50 flex flex-col overflow-hidden">
      {/* 🎮 游戏网格区 */}
      <div className="grid grid-cols-2 md:grid-cols-4 grid-rows-5 gap-2 w-full flex-1 pl-4 pr-4 pt-4 pb-2 overflow-hidden">
        {currentWords.map((item) => {
          const itemKey = item.id + item.type
          const isMatched = matchedIds.has(item.id)
          const isCorrect = correctKeys.has(itemKey)
          const isSelected = selectedCard === item
          const isError = errorKeys.has(itemKey)

          return (
            <div
              key={itemKey}
              onClick={() => handleCardClick(item)}
              className={`w-full h-full transition-all duration-300 
                ${isMatched ? 'invisible opacity-0 pointer-events-none scale-95' : 'opacity-100 scale-100'}
                ${isError ? 'animate-shake' : ''}
              `}
            >
              {item.type === 'text' ? (
                /* 📝 单词卡片 */
                <div
                  className={`w-full h-full flex flex-col items-center justify-center border rounded-2xl p-3 shadow-sm active:scale-[0.98] transition-all cursor-pointer select-none
                    ${
                      isCorrect
                        ? 'border-success bg-success-50 text-success scale-[1.02]'
                        : isError
                          ? 'border-danger bg-danger-50 text-danger'
                          : isSelected
                            ? 'border-warning bg-amber-50 text-warning scale-[1.02]'
                            : 'border-default-100 bg-white text-neutral-800'
                    }
                  `}
                  onClick={() => {
                    playAudio(item.word.audio_url)
                  }}
                >
                  <p className="font-bold tracking-wide break-all text-center md:text-3xl">
                    {item.word.word}
                  </p>
                </div>
              ) : (
                /* 🖼️ 图片卡片 */
                <div
                  className={`w-full h-full border flex items-center justify-center rounded-2xl p-2 shadow-sm active:scale-[0.98] transition-all cursor-pointer select-none overflow-hidden
                    ${
                      isCorrect
                        ? 'border-success bg-success-50 scale-[1.02]'
                        : isError
                          ? 'border-danger bg-danger-50'
                          : isSelected
                            ? 'border-warning bg-amber-50 scale-[1.02]'
                            : 'border-default-100 bg-neutral-50'
                    }
                  `}
                >
                  <img
                    src={item.word.image_url}
                    alt="Mnemonics"
                    decoding="async"
                    className="max-w-full max-h-full object-contain rounded-xl"
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 底部固定导航栏 */}
      <div className="mt-2 pt-1 pb-1 pl-4 pr-6 flex items-center justify-between shrink-0 border-t border-default-100">
        <div className="flex flex-1 items-center justify-start">
          <Button
            size="lg"
            isIconOnly
            variant="ghost"
            onClick={() => {
              setIsLoading(true)
              router.push('/')
            }}
          >
            <House />
          </Button>
        </div>
        <span className="text-xs text-default-400 font-medium select-none">
          {matchedIds.size} / {currentWords.length / 2}
        </span>
      </div>

      {/* 注入全局震动错落动画 */}
      <style jsx global>{`
        @keyframes shake {
          0%,
          100% {
            transform: translateX(0);
          }
          20%,
          60% {
            transform: translateX(-6px);
          }
          40%,
          80% {
            transform: translateX(6px);
          }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}</style>
    </div>
  )
}
