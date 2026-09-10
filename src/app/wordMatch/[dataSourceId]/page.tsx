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
  id: string
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

  // 电脑端一关 10 个单词（20张卡片）；手机端 5 个单词（10张卡片）
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
  const limitCount = isDesktop ? 10 : 5

  const [ids, setIds] = useState<string[]>([])

  // 🎮 核心数据状态
  const [currentWords, setCurrentWords] = useState<WordMatchItem[]>([])

  // 📦 预加载缓存池：存储后面几关（第 2 关、第 3 关...）的卡片组数据
  const wordQueueRef = useRef<WordMatchItem[][]>([])

  // 🎯 消除游戏互动状态
  const [selectedCard, setSelectedCard] = useState<WordMatchItem | null>(null)
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set())
  const [correctKeys, setCorrectKeys] = useState<Set<string>>(new Set())
  const [errorKeys, setErrorKeys] = useState<Set<string>>(new Set())

  // 🍎 iOS 音频对象池及解锁状态
  const audioPoolRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const playAudioIsActivated = useRef(false)

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

  // 🌟 单个音频资源加载校验（带 4 秒超时防护）
  const loadSingleAudio = useCallback((url: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!url) {
        resolve()
        return
      }

      let audio = audioPoolRef.current.get(url)
      if (!audio) {
        audio = new Audio()
        audio.preload = 'auto'
        audio.src = url
        audioPoolRef.current.set(url, audio)
      }

      if (audio.readyState >= 3) {
        resolve()
        return
      }

      let timer: NodeJS.Timeout | null = null

      const cleanup = () => {
        if (timer) clearTimeout(timer)
        audio?.removeEventListener('canplaythrough', onCanPlay)
        audio?.removeEventListener('error', onError)
      }

      const onCanPlay = () => {
        cleanup()
        resolve()
      }

      const onError = () => {
        cleanup()
        resolve()
      }

      audio.addEventListener('canplaythrough', onCanPlay)
      audio.addEventListener('error', onError)
      audio.load()

      timer = setTimeout(() => {
        cleanup()
        resolve()
      }, 4000)
    })
  }, [])

  // 🌟 单个图片资源加载校验（带 4 秒超时防护）
  const loadSingleImage = useCallback((url: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!url) {
        resolve()
        return
      }

      const img = new Image()
      let timer: NodeJS.Timeout | null = null

      const cleanup = () => {
        if (timer) clearTimeout(timer)
        img.onload = null
        img.onerror = null
      }

      img.onload = () => {
        cleanup()
        resolve()
      }

      img.onerror = () => {
        cleanup()
        resolve()
      }

      img.src = url

      // 如果浏览器已有本地缓存
      if (img.complete) {
        cleanup()
        resolve()
      }

      timer = setTimeout(() => {
        cleanup()
        resolve()
      }, 4000)
    })
  }, [])

  // 🌟 确保卡片组中的所有音频和图片都预加载完毕
  const preloadAndCheckAssets = useCallback(
    async (items: WordMatchItem[]) => {
      if (typeof window === 'undefined') return

      const audioUrls = Array.from(
        new Set(
          items
            .map((item) => item.word?.audio_url)
            .filter((url): url is string => Boolean(url)),
        ),
      )

      const imageUrls = Array.from(
        new Set(
          items
            .map((item) => item.word?.image_url)
            .filter((url): url is string => Boolean(url)),
        ),
      )

      // 并行等待所有音频和图片就绪
      await Promise.all([
        ...audioUrls.map((url) => loadSingleAudio(url)),
        ...imageUrls.map((url) => loadSingleImage(url)),
      ])
    },
    [loadSingleAudio, loadSingleImage],
  )

  // 后续关卡音视频后台静默预加载
  const preloadAudiosForIOS = useCallback((itemsList: WordMatchItem[][]) => {
    if (typeof window === 'undefined') return

    const flatItems = itemsList.flat()

    // 后台静默缓存音频
    flatItems
      .map((item) => item.word?.audio_url)
      .filter((url): url is string => Boolean(url))
      .forEach((url) => {
        let audio = audioPoolRef.current.get(url)
        if (!audio) {
          audio = new Audio()
          audio.preload = 'auto'
          audio.src = url
          audioPoolRef.current.set(url, audio)
        }
        if (playAudioIsActivated.current) {
          audio.load()
        }
      })

    // 后台静默缓存图片
    flatItems
      .map((item) => item.word?.image_url)
      .filter((url): url is string => Boolean(url))
      .forEach((url) => {
        const img = new Image()
        img.src = url
      })
  }, [])

  // 从 ID 池拉取一关的数据
  const fetchBatchWords = useCallback(
    async (allIds: string[]): Promise<WordMatchItem[]> => {
      if (!allIds || allIds.length === 0) return []
      const shuffled = [...allIds]

      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      const nextIds = shuffled.slice(0, limitCount)
      const res = await NotionWordGetByIdsClient(nextIds)
      if (res.code === 200) {
        return toWordMatchItem(res.data || [])
      }
      return []
    },
    [limitCount],
  )

  // 补充预加载队列：保持预加载 2 关的数据（第 2 页与第 3 页）
  const fillPreloadQueue = useCallback(
    async (allIds: string[]) => {
      const TARGET_QUEUE_SIZE = 2
      while (wordQueueRef.current.length < TARGET_QUEUE_SIZE) {
        const batch = await fetchBatchWords(allIds)
        if (batch.length > 0) {
          wordQueueRef.current.push(batch)
        } else {
          break
        }
      }
      preloadAudiosForIOS(wordQueueRef.current)
    },
    [fetchBatchWords, preloadAudiosForIOS],
  )

  // 监听页面手势，解锁 iOS 音频限制
  useEffect(() => {
    const unlockIOSAudio = () => {
      if (!playAudioIsActivated.current && globalAudio) {
        globalAudio.src =
          'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=='
        globalAudio
          .play()
          .then(() => {
            playAudioIsActivated.current = true
          })
          .catch(() => {})
      }
      preloadAudiosForIOS(wordQueueRef.current)
    }

    window.addEventListener('touchstart', unlockIOSAudio, { once: true })
    window.addEventListener('click', unlockIOSAudio, { once: true })

    return () => {
      window.removeEventListener('touchstart', unlockIOSAudio)
      window.removeEventListener('click', unlockIOSAudio)
    }
  }, [preloadAudiosForIOS])

  // 🌟 播放音频并返回 Promise，音频播放完毕（或触发异常兜底）后 resolve
  const playAudioUntilEnd = useCallback((audio_url?: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!audio_url) {
        resolve()
        return
      }

      const cachedAudio = audioPoolRef.current.get(audio_url)
      const targetAudio = cachedAudio || globalAudio

      if (!targetAudio) {
        resolve()
        return
      }

      let timeoutTimer: NodeJS.Timeout | null = null

      const cleanup = () => {
        if (timeoutTimer) clearTimeout(timeoutTimer)
        targetAudio.removeEventListener('ended', onEnded)
        targetAudio.removeEventListener('error', onError)
      }

      const onEnded = () => {
        cleanup()
        resolve()
      }

      const onError = () => {
        cleanup()
        resolve()
      }

      targetAudio.addEventListener('ended', onEnded)
      targetAudio.addEventListener('error', onError)

      // 防卡死兜底（最多等待 3.5 秒）
      timeoutTimer = setTimeout(() => {
        cleanup()
        resolve()
      }, 3500)

      if (cachedAudio) {
        cachedAudio.currentTime = 0
        cachedAudio.play().catch(() => {
          if (globalAudio) {
            globalAudio.src = audio_url
            globalAudio.play().catch(() => {
              cleanup()
              resolve()
            })
          } else {
            cleanup()
            resolve()
          }
        })
      } else if (globalAudio) {
        globalAudio.src = audio_url
        globalAudio.play().catch(() => {
          cleanup()
          resolve()
        })
      }
    })
  }, [])

  // 🚀 初始化游戏数据逻辑
  useEffect(() => {
    const initGameData = async () => {
      try {
        setIsLoading(true)
        setIds([])
        wordQueueRef.current = []

        const res = await NotionWordAllIdsByImgClient(dataSourceId)
        if (res.code === 200) {
          const fetchedIds = res.data as string[]
          setIds(fetchedIds)

          // 1. 优先拉取当前第一关（第 1 页）数据
          const firstBatch = await fetchBatchWords(fetchedIds)
          setCurrentWords(firstBatch)

          // 2. 🌟 阻塞等待第 1 页的所有音频与图片全部加载完成
          await preloadAndCheckAssets(firstBatch)

          // 3. 此时第一页图片+音频全就绪，关闭 Loading 渲染界面
          setIsLoading(false)

          // 4. 在后台悄悄预加载后续第 2 页和第 3 页的数据及音视频
          void fillPreloadQueue(fetchedIds)
        } else {
          setIsLoading(false)
        }
      } catch (error) {
        console.error('初始化游戏失败:', error)
        setIsLoading(false)
      }
    }
    void initGameData()
  }, [dataSourceId, fetchBatchWords, fillPreloadQueue, preloadAndCheckAssets])

  // 🖱️ 点击卡片处理逻辑
  const handleCardClick = (item: WordMatchItem) => {
    const itemKey = item.id + item.type

    // 拦截不可点击状态
    if (
      matchedIds.has(item.id) ||
      correctKeys.has(itemKey) ||
      errorKeys.has(itemKey) ||
      selectedCard === item
    ) {
      return
    }

    // 1. 未选中任何卡片
    if (!selectedCard) {
      setSelectedCard(item)
      return
    }

    // 2. 连续点击相同类型的卡片（如连续点两个文字或两个图片）
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

      // 异步执行：等待音频播放完毕 + 额外等待 500ms 后才消卡
      const handleCorrectMatch = async () => {
        // 播放当前匹配成功单词的音频
        await playAudioUntilEnd(item.word?.audio_url)

        // 🌟 发音结束后再等待 500ms 消失
        await new Promise((resolve) => setTimeout(resolve, 500))

        setMatchedIds((prev) => {
          const newMatched = new Set(prev)
          newMatched.add(matchedId)

          // 检测本关卡片是否全部消除
          if (newMatched.size === currentWords.length / 2) {
            setTimeout(() => {
              // 从预加载队列弹出下一关（第 2 页）数据
              const nextBatch = wordQueueRef.current.shift()
              if (nextBatch && nextBatch.length > 0) {
                setCurrentWords(nextBatch)
              }
              setMatchedIds(new Set())
              setSelectedCard(null)

              // 自动拉取后续关卡补充队列，维持 2 关储备
              void fillPreloadQueue(ids)
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
      }

      void handleCorrectMatch()
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
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-neutral-50 gap-3">
        <Spinner color="current" />
        <span className="text-sm text-neutral-400 font-medium select-none">
          Loading...
        </span>
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
