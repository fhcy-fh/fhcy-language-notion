'use client'

import React, { use, useCallback, useEffect, useRef, useState } from 'react'
import { Button, Spinner } from '@heroui/react'
import { House, RotateCcw, Trophy } from 'lucide-react'
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

  // 剩余尚未抽取的 ID 池
  const remainingIdsRef = useRef<string[]>([])

  // 🎮 核心数据状态
  const [currentWords, setCurrentWords] = useState<WordMatchItem[]>([])

  // 📦 预加载缓存池：存储后面几关的卡片组数据
  const wordQueueRef = useRef<WordMatchItem[][]>([])

  // 🎯 消除游戏互动状态
  const [selectedCard, setSelectedCard] = useState<WordMatchItem | null>(null)
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set())
  const [correctKeys, setCorrectKeys] = useState<Set<string>>(new Set())
  const [errorKeys, setErrorKeys] = useState<Set<string>>(new Set())

  // 🏆 游戏通关弹窗控制
  const [isGameCompleted, setIsGameCompleted] = useState(false)

  // 🍎 使用单例 Audio 实例解决移动端音轨实例数量受限问题
  const globalAudioRef = useRef<HTMLAudioElement | null>(null)
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

  // 初始化全局 Audio 单例
  useEffect(() => {
    if (typeof window !== 'undefined' && !globalAudioRef.current) {
      const audio = new Audio()
      audio.preload = 'auto'
      globalAudioRef.current = audio
    }
  }, [])

  // 🌟 单个音频资源网络缓存预加载（只利用 Fetch API 写入浏览器 HTTP 缓存，不创建 Audio 实例）
  const loadSingleAudio = useCallback((url: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!url) {
        resolve()
        return
      }

      const timer = setTimeout(() => {
        resolve()
      }, 3000)

      fetch(url, { cache: 'force-cache' })
        .then(() => {
          clearTimeout(timer)
          resolve()
        })
        .catch(() => {
          clearTimeout(timer)
          resolve()
        })
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

      await Promise.all([
        ...audioUrls.map((url) => loadSingleAudio(url)),
        ...imageUrls.map((url) => loadSingleImage(url)),
      ])
    },
    [loadSingleAudio, loadSingleImage],
  )

  // 后续关卡音视频后台静默预加载
  const preloadAudiosForIOS = useCallback(
    (itemsList: WordMatchItem[][]) => {
      if (typeof window === 'undefined') return

      const flatItems = itemsList.flat()

      // 静默缓存音频文件
      flatItems
        .map((item) => item.word?.audio_url)
        .filter((url): url is string => Boolean(url))
        .forEach((url) => {
          void loadSingleAudio(url)
        })

      // 静默缓存图片
      flatItems
        .map((item) => item.word?.image_url)
        .filter((url): url is string => Boolean(url))
        .forEach((url) => {
          const img = new Image()
          img.src = url
        })
    },
    [loadSingleAudio],
  )

  // 从未使用的 ID 池中无重复地拉取一关数据
  const fetchNextBatchWords = useCallback(async (): Promise<
    WordMatchItem[]
  > => {
    if (remainingIdsRef.current.length === 0) return []

    const nextIds = remainingIdsRef.current.splice(0, limitCount)
    if (nextIds.length === 0) return []

    const res = await NotionWordGetByIdsClient(nextIds)
    if (res.code === 200) {
      return toWordMatchItem(res.data || [])
    }
    return []
  }, [limitCount])

  // 补充预加载队列：保持预加载 2 关的数据
  const fillPreloadQueue = useCallback(async () => {
    const TARGET_QUEUE_SIZE = 2
    while (
      wordQueueRef.current.length < TARGET_QUEUE_SIZE &&
      remainingIdsRef.current.length > 0
    ) {
      const batch = await fetchNextBatchWords()
      if (batch.length > 0) {
        wordQueueRef.current.push(batch)
      } else {
        break
      }
    }
    preloadAudiosForIOS(wordQueueRef.current)
  }, [fetchNextBatchWords, preloadAudiosForIOS])

  // 解锁 iOS 音频限制（激活单例 Audio）
  useEffect(() => {
    const unlockIOSAudio = () => {
      const audio = globalAudioRef.current
      if (!playAudioIsActivated.current && audio) {
        audio.src =
          'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=='
        audio
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

  // 🌟 播放音频并返回 Promise（基于音频单例重设 src）
  const playAudioUntilEnd = useCallback((audio_url?: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!audio_url) {
        resolve()
        return
      }

      const audio = globalAudioRef.current
      if (!audio) {
        resolve()
        return
      }

      let timeoutTimer: NodeJS.Timeout | null = null

      const cleanup = () => {
        if (timeoutTimer) clearTimeout(timeoutTimer)
        audio.removeEventListener('ended', onEnded)
        audio.removeEventListener('error', onError)
      }

      const onEnded = () => {
        cleanup()
        resolve()
      }

      const onError = () => {
        cleanup()
        resolve()
      }

      audio.addEventListener('ended', onEnded)
      audio.addEventListener('error', onError)

      // 防卡死兜底（最多等待 3.5 秒）
      timeoutTimer = setTimeout(() => {
        cleanup()
        resolve()
      }, 3500)

      try {
        audio.pause()
        audio.currentTime = 0
        audio.src = audio_url
        audio.load()

        const playPromise = audio.play()
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('Audio play error fallback:', err)
            cleanup()
            resolve()
          })
        }
      } catch (err) {
        console.warn('Audio execution catch:', err)
        cleanup()
        resolve()
      }
    })
  }, [])

  // 🚀 初始化 / 重新开始游戏逻辑
  const initGameData = useCallback(async () => {
    try {
      setIsLoading(true)
      setIsGameCompleted(false)
      setSelectedCard(null)
      setMatchedIds(new Set())
      setCorrectKeys(new Set())
      setErrorKeys(new Set())
      wordQueueRef.current = []

      const res = await NotionWordAllIdsByImgClient(dataSourceId)
      if (res.code === 200 && Array.isArray(res.data)) {
        const shuffled = [...(res.data as string[])]
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }
        remainingIdsRef.current = shuffled

        const firstBatch = await fetchNextBatchWords()
        setCurrentWords(firstBatch)

        await preloadAndCheckAssets(firstBatch)

        setIsLoading(false)

        void fillPreloadQueue()
      } else {
        setIsLoading(false)
      }
    } catch (error) {
      console.error('初始化游戏失败:', error)
      setIsLoading(false)
    }
  }, [
    dataSourceId,
    fetchNextBatchWords,
    fillPreloadQueue,
    preloadAndCheckAssets,
  ])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void initGameData()
  }, [initGameData])

  // 🖱️ 点击卡片处理逻辑
  const handleCardClick = (item: WordMatchItem) => {
    const itemKey = item.id + item.type

    if (
      matchedIds.has(item.id) ||
      correctKeys.has(itemKey) ||
      errorKeys.has(itemKey) ||
      selectedCard === item
    ) {
      return
    }

    if (!selectedCard) {
      setSelectedCard(item)
      return
    }

    if (selectedCard.type === item.type) {
      setSelectedCard(item)
      return
    }

    const selectedKey = selectedCard.id + selectedCard.type

    if (selectedCard.id === item.id) {
      // ✅ 配对成功
      const matchedId = item.id
      setCorrectKeys(new Set([selectedKey, itemKey]))
      setSelectedCard(null)

      const handleCorrectMatch = async () => {
        await playAudioUntilEnd(item.word?.audio_url)
        await new Promise((resolve) => setTimeout(resolve, 100))

        setMatchedIds((prev) => {
          const newMatched = new Set(prev)
          newMatched.add(matchedId)

          // 检测本关卡片是否全部消除
          if (newMatched.size === currentWords.length / 2) {
            setTimeout(() => {
              const nextBatch = wordQueueRef.current.shift()
              if (nextBatch && nextBatch.length > 0) {
                setCurrentWords(nextBatch)
                setMatchedIds(new Set())
                setSelectedCard(null)
                void fillPreloadQueue()
              } else {
                // 🌟 没有下一关数据了，触发全通关弹窗
                setIsGameCompleted(true)
              }
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

      {/* 🏆 完成提示自定义弹窗 */}
      {isGameCompleted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 p-4">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-sm w-full text-center shadow-xl flex flex-col items-center">
            <div className="w-16 h-16 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mb-4">
              <Trophy className="w-8 h-8" />
            </div>

            <h3 className="text-2xl font-bold text-gray-800 mb-2">
              Great Job! 🎉
            </h3>
            <p className="text-gray-500 text-sm mb-6">
              Congratulations! You&apos;ve completed all the words!
            </p>

            <div className="flex flex-col gap-3 w-full">
              <Button
                size="lg"
                className="w-full font-semibold shadow-md flex items-center justify-center gap-2"
                onClick={() => void initGameData()}
              >
                <RotateCcw className="w-5 h-5" />
                Let&apos;s Do It Again
              </Button>
              <Button
                size="lg"
                className="w-full font-semibold shadow-md flex items-center justify-center gap-2"
                onClick={() => {
                  setIsLoading(true)
                  router.push('/')
                }}
              >
                Back to Home
              </Button>
            </div>
          </div>
        </div>
      )}

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
