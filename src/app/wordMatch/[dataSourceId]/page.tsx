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
  const [correctKeys, setCorrectKeys] = useState<Set<string>>(new Set()) // 🌟 记录处于“选对高亮”状态的卡片Key
  const [errorKeys, setErrorKeys] = useState<Set<string>>(new Set()) // 用于记录当前震动闪红的卡片键

  // 🍎 iOS 音频对象池及解锁状态
  const audioPoolRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const playAudioIsActivated = useRef(false)

  // 🍎 解锁 iOS 音频限制并批量 preload
  const preloadAudiosForIOS = useCallback(() => {
    if (typeof window === 'undefined') return

    // 收集当前轮与下一轮所有音频 URL
    const allUrls = [...currentWords, ...nextWords]
      .map((item) => item.word?.audio_url)
      .filter((url): url is string => Boolean(url))

    allUrls.forEach((url) => {
      let audio = audioPoolRef.current.get(url)
      if (!audio) {
        audio = new Audio()
        audio.preload = 'auto'
        audio.src = url
        audioPoolRef.current.set(url, audio)
      }
      // 🌟 iOS 关键点：只有在用户手势回调中执行 load() 才能触发网络加载
      audio.load()
    })
  }, [currentWords, nextWords])

  // 🌟 监听页面首次手势，激活 iOS 音频环境并预加载
  useEffect(() => {
    const unlockIOSAudio = () => {
      if (!playAudioIsActivated.current && globalAudio) {
        // 先用静音 wav 解锁全局音频实例
        globalAudio.src =
          'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=='
        globalAudio
          .play()
          .then(() => {
            playAudioIsActivated.current = true
          })
          .catch(() => {})
      }
      // 触发音频预加载 load
      preloadAudiosForIOS()
    }

    window.addEventListener('touchstart', unlockIOSAudio, { once: true })
    window.addEventListener('click', unlockIOSAudio, { once: true })

    return () => {
      window.removeEventListener('touchstart', unlockIOSAudio)
      window.removeEventListener('click', unlockIOSAudio)
    }
  }, [preloadAudiosForIOS])

  // 数据加载更新时尝试预加载
  useEffect(() => {
    if (playAudioIsActivated.current) {
      preloadAudiosForIOS()
    }
  }, [currentWords, nextWords, preloadAudiosForIOS])

  // 播放音频逻辑
  const playAudio = useCallback((audio_url: string) => {
    if (!audio_url) return

    // 优先从预加载池中使用已经 load 过的 Audio 实例
    const cachedAudio = audioPoolRef.current.get(audio_url)

    if (cachedAudio) {
      cachedAudio.currentTime = 0
      cachedAudio.play().catch(() => {
        // 回退机制：若缓存实例播放失败，使用 globalAudio 播放
        if (globalAudio) {
          globalAudio.src = audio_url
          globalAudio.play().catch(() => {})
        }
      })
    } else if (globalAudio) {
      globalAudio.src = audio_url
      globalAudio.play().catch(() => {})
    }
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
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      const nextIds = shuffled.slice(0, limitCount)
      const res = await NotionWordGetByIdsClient(nextIds)
      if (res.code === 200) {
        const items = toWordMatchItem(res.data || [])
        setNextWords(items)
      }
    },
    [limitCount],
  )

  // 获取当前轮数据
  const fetchCurrentWords = useCallback(
    async (ids: string[]) => {
      if (!ids || ids.length === 0) return
      const shuffled = [...ids]

      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      const nextIds = shuffled.slice(0, limitCount)
      const res = await NotionWordGetByIdsClient(nextIds)
      if (res.code === 200) {
        const items = toWordMatchItem(res.data || [])
        setCurrentWords(items)
      }
    },
    [limitCount],
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
    // 🌟 无论点图片还是文字，均播放该单词的发音
    if (item.word?.audio_url) {
      playAudio(item.word.audio_url)
    }

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

    // 2. 如果连续点了相同类型的卡片，切换选择
    if (selectedCard.type === item.type) {
      setSelectedCard(item)
      return
    }

    // 3. 开始匹配判定
    const selectedKey = selectedCard.id + selectedCard.type

    if (selectedCard.id === item.id) {
      // ✅ 配对成功
      const matchedId = item.id
      setCorrectKeys(new Set([selectedKey, itemKey]))
      setSelectedCard(null)

      // 延迟 450ms 让用户看清结果后消除
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
      setSelectedCard(null)

      setTimeout(() => {
        setErrorKeys(new Set())
      }, 500)
    }
  }

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
