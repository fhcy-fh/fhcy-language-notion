'use client'

import React, { use, useCallback, useEffect, useRef, useState } from 'react'
import { Button, Spinner } from '@heroui/react'
import { WordType } from '@/src/types/WordTypes'
import {
  ArrowDownAZ,
  House,
  Image,
  ImageOff,
  Languages,
  Shuffle,
  Zap,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  NotionWordAllIdsClient,
  NotionWordGetByIdsClient,
} from '@/src/client/WordClient'

const globalAudio = typeof window !== 'undefined' ? new Audio() : null

export default function WordSwipePage({
  params,
}: {
  params: Promise<{ dataSourceId: string }>
}) {
  const { dataSourceId } = use(params)
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)

  const [words, setWords] = useState<WordType[]>([])
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [isOrder, setIsOrder] = useState(false)
  const [isShowDefinition, setIsShowDefinition] = useState(false)
  const [isShowImage, setIsShowImage] = useState(true)

  const isPreloadingRef = useRef(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isInternalScrollRef = useRef(false) // 避免状态反馈陷入死循环
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null) // 🌟 引入定时器做滚动结束判定

  const currentWord = words[currentIndex]

  const [ids, setIds] = useState<string[]>()

  // 🌟 缓存已创建的预加载音频对象，避免重复下载
  const MAX_CACHE_SIZE = 50
  const audioCacheRef = useRef<Map<string, string>>(new Map())

  // 🌟 新增：用于记录滚轮节流的时间戳，防止 PC 滚轮高频触发导致卡片连续飞速切页
  const lastWheelTimeRef = useRef(0)

  const fetchWordAllIds = useCallback(async () => {
    try {
      setIsLoading(true)
      setIds([])
      setWords([])
      audioCacheRef.current.clear()
      const res = await NotionWordAllIdsClient(dataSourceId)
      if (res.code === 200) {
        const resIds = res.data as string[]
        let ids = resIds
        if (!isOrder) {
          const shuffled = [...resIds]
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
          }
          ids = shuffled
        }
        setIds(ids)
        if (ids && ids.length > 0) {
          const nextIds = ids.slice(0, 10)
          const res = await NotionWordGetByIdsClient(nextIds)
          if (res.code === 200) {
            setWords(res.data || [])
          }
        }
      }
    } catch (error) {
      console.log('error: ' + error)
    } finally {
      setCurrentIndex(0)
      setIsLoading(false)
    }
  }, [dataSourceId, isOrder])

  // 初始化数据
  useEffect(() => {
    const initWordIds = async () => {
      await fetchWordAllIds()
    }
    void initWordIds()
  }, [fetchWordAllIds])

  const doItAgain = async () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = 0
    }
    setCurrentIndex(0)
    await fetchWordAllIds()
  }

  // 预加载
  useEffect(() => {
    const getWords = async () => {
      if (ids && ids.length > 0) {
        if (words.length > 0 && words.length < ids.length) {
          if (currentIndex >= words.length - 8 && !isPreloadingRef.current) {
            isPreloadingRef.current = true
            try {
              const nextIds = ids.slice(words.length, words.length + 10)
              const res = await NotionWordGetByIdsClient(nextIds)
              if (res.code === 200) {
                const list = (res.data as WordType[]) || []
                if (list.length > 0) {
                  setWords((prev) => [...prev, ...list])
                }
              }
            } finally {
              isPreloadingRef.current = false
            }
          }
        }
      }
    }
    void getWords()
  }, [ids, currentIndex, words.length])

  // 音频流自动预加载逻辑
  useEffect(() => {
    if (words.length === 0) return
    const cache = audioCacheRef.current
    const PRELOAD_COUNT = 5
    for (let i = 1; i <= PRELOAD_COUNT; i++) {
      const nextWord = words[currentIndex + i]
      if (
        nextWord?.audio_url &&
        !audioCacheRef.current.has(nextWord.audio_url)
      ) {
        const url = nextWord.audio_url
        audioCacheRef.current.set(url, 'loading')

        fetch(url)
          .then((res) => {
            if (!res.ok) throw new Error('Network response was not ok')
            return res.blob()
          })
          .then((blob) => {
            const blobUrl = URL.createObjectURL(blob)
            if (cache.size >= MAX_CACHE_SIZE) {
              const oldestKey = cache.keys().next().value
              if (oldestKey) {
                const oldestUrl = cache.get(oldestKey)
                if (oldestUrl?.startsWith('blob:')) {
                  URL.revokeObjectURL(oldestUrl)
                }
                cache.delete(oldestKey)
                console.log(`[Cache] 内存释放成功，淘汰了: ${oldestKey}`)
              }
            }
            audioCacheRef.current.set(url, blobUrl)
            console.log(
              `[Preload Success] ${nextWord.word} 已转为本地 Blob URL`,
            )
          })
          .catch((err) => {
            console.error(`预加载失败:`, err)
            audioCacheRef.current.delete(url)
          })
      }
    }
  }, [currentIndex, words])

  // 组件销毁时清理定时器
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    }
  }, [])

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

      if (
        globalAudio.src === audio_url ||
        globalAudio.src === audioCacheRef.current.get(audio_url)
      ) {
        if (globalAudio.paused) {
          globalAudio.play().catch(() => {})
        }
        return
      }

      activateAudioForIOS()

      const cachedBlobUrl = audioCacheRef.current.get(audio_url)
      if (cachedBlobUrl && cachedBlobUrl !== 'loading') {
        globalAudio.src = cachedBlobUrl
      } else {
        globalAudio.src = audio_url
      }

      globalAudio.load()
      globalAudio.play().catch(() => {})
    },
    [activateAudioForIOS],
  )

  useEffect(() => {
    void playAudio(currentWord?.audio_url)
  }, [currentWord, playAudio])

  // 原生滚动（H5 手指滑动及系统默认横向滚动）与强磁力补正逻辑
  const handleScroll = () => {
    const container = scrollContainerRef.current
    if (!container || isInternalScrollRef.current) return
    const { scrollLeft, clientWidth } = container
    if (clientWidth === 0) return

    const newIndex = Math.round(scrollLeft / clientWidth)
    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < words.length) {
      setCurrentIndex(newIndex)
    }

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)

    scrollTimeoutRef.current = setTimeout(() => {
      const targetScrollLeft = newIndex * clientWidth

      if (Math.abs(container.scrollLeft - targetScrollLeft) > 2) {
        isInternalScrollRef.current = true
        container.scrollTo({
          left: targetScrollLeft,
          behavior: 'smooth',
        })

        setTimeout(() => {
          isInternalScrollRef.current = false
        }, 300)
      }
    }, 150) // 缩短至 60ms 快速磁吸
  }

  // 🌟 核心新增：PC 鼠标普通上下滚轮转换为左右翻页
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      // 如果没有纵向滚动偏移量，或者是双向触控板自由滑动，不强制干预
      if (e.deltaY === 0) return

      // 阻止浏览器默认的纵向滚动行为
      e.preventDefault()

      // 限制触发频率（防抖/节流：500ms 内只允许切一页），防止普通鼠标滚轮一滚飞滑十几张卡片
      const now = Date.now()
      if (now - lastWheelTimeRef.current < 500) return

      const { clientWidth } = container
      if (clientWidth === 0) return

      // 根据滚轮方向判断上一张还是下一张
      let nextIndex = currentIndex
      if (e.deltaY > 0) {
        // 向下滚轮 -> 看下一张
        nextIndex = Math.min(currentIndex + 1, words.length - 1)
      } else {
        // 向上滚轮 -> 看上一张
        nextIndex = Math.max(currentIndex - 1, 0)
      }

      if (nextIndex !== currentIndex) {
        lastWheelTimeRef.current = now
        isInternalScrollRef.current = true
        setCurrentIndex(nextIndex)

        container.scrollTo({
          left: nextIndex * clientWidth,
          behavior: 'smooth',
        })

        setTimeout(() => {
          isInternalScrollRef.current = false
        }, 400) // 动画结束后解锁
      }
    }

    // 必须通过原生 addEventListener 并设置 passive: false 才能有效执行 preventDefault()
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [currentIndex, words.length])

  const getFontSizeClass = (wordLength: number) => {
    if (wordLength > 15) {
      // 超长单词 (如: incomprehensible)
      return 'text-xl md:text-6xl'
    }
    if (wordLength > 10) {
      // 较长单词 (如: beautiful, individual)
      return 'text-2xl md:text-6xl'
    }
    if (wordLength > 7) {
      // 中等长度 (如: student)
      return 'text-3xl md:text-6xl'
    }
    // 短单词
    return 'text-4xl md:text-6xl'
  }

  if (isLoading && words.length === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center ">
        <Spinner color="current" />
      </div>
    )
  }

  return (
    <div className="w-full h-full mx-auto flex flex-col overflow-hidden">
      {/* 卡片核心展示区 */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 flex flex-row overflow-x-auto overflow-y-hidden snap-x mandatory h-full w-full relative no-scrollbar"
        style={{
          WebkitOverflowScrolling: 'touch',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          ...({
            '&::webkitScrollbar': { display: 'none' },
          } as React.CSSProperties),
        }}
      >
        {words.map((word, index) => (
          <div
            key={`${word.id}-${index}`}
            className="w-full h-full shrink-0 snap-center snap-always px-4 pt-2 pb-3 box-border"
            style={{ contentVisibility: 'auto' }}
          >
            <div
              onClick={() => playAudio(word.audio_url)}
              className="w-full h-full flex flex-col items-center justify-center bg-gray-50 border border-gray-100 rounded-2xl pb-4 overflow-hidden
              shadow-md active:shadow-inner active:scale-[0.98] transition-all duration-75 select-none"
            >
              <div className="w-full flex justify-end items-center pl-3 pr-3 pt-2"></div>
              <div className="flex flex-1 w-full items-center justify-center pl-4 pr-4">
                <div>
                  <div className="text-center pointer-events-none">
                    <p
                      className={`${getFontSizeClass(word.word?.length || 0)} font-bold text-warning tracking-wide break-words max-w-full transition-all duration-200`}
                    >
                      {word.word}
                    </p>

                    {word.phonetic && (
                      <p className="text-sm md:text-lg font-medium text-neutral-400 mt-1.5 font-sans tracking-wide">
                        /{word.phonetic}/
                      </p>
                    )}
                  </div>

                  {isShowImage && word.image_url && (
                    <div className="w-full flex items-center justify-center p-2 mt-2 overflow-hidden shrink bg-gray-50 pointer-events-none">
                      <img
                        src={word.image_url}
                        alt="Mnemonics"
                        decoding="async"
                        loading={
                          Math.abs(index - currentIndex) <= 1 ? 'eager' : 'lazy'
                        }
                        className="object-cover rounded-lg"
                      />
                    </div>
                  )}

                  {word.definition && (
                    <div className="flex justify-center">
                      {word.pos && (
                        <div>
                          <p className="text-sm font-medium text-neutral-400 mt-2 font-sans tracking-wide">
                            {word.pos?.replace(/^[.\s]+|[.\s]+$/g, '')}.
                          </p>
                        </div>
                      )}
                      {isShowDefinition && (
                        <p className="text-sm font-medium text-neutral-600 mt-2 ml-1 max-w-[90%] leading-relaxed ">
                          {word.definition}
                        </p>
                      )}
                    </div>
                  )}
                  {index === words.length - 1 && (
                    <div className="pt-6 pb-2 pl-10 pr-10 w-full">
                      <Button
                        size="lg"
                        fullWidth={true}
                        onClick={(e) => {
                          e.stopPropagation() // 阻止触发卡片本身的点击音频事件
                          void doItAgain()
                        }}
                      >
                        <Zap className="text-amber-400 fill-amber-400" />
                        Let&#39;s Do It Again
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* 底部固定进度 */}
      <div className="pt-1 pb-1 pl-4 pr-6 flex items-center justify-between shrink-0 border-t border-gray-100  ">
        <div className="flex flex-1 items-center justify-start">
          <Button
            size="lg"
            isIconOnly
            variant="ghost"
            onClick={() => {
              setIsLoading(true)
              router.push('/')
            }}
            isPending={isLoading}
          >
            {({ isPending }) => (
              <>
                {isPending ? <Spinner color="current" size="sm" /> : <House />}
              </>
            )}
          </Button>
          <div className="ml-4 flex items-center justify-center">
            <button
              onClick={() => setIsOrder(!isOrder)}
              className={`p-1 rounded transition-colors focus:outline-none ${
                isOrder
                  ? 'text-blue-600 hover:bg-blue-100'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              title={isOrder ? 'order' : 'shuffled'}
            >
              {isOrder ? (
                <ArrowDownAZ className="h-4 w-4" />
              ) : (
                <Shuffle className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="ml-4 flex items-center justify-center">
            <button
              onClick={() => setIsShowImage(!isShowImage)}
              className={`p-1 rounded transition-colors focus:outline-none ${
                isShowImage
                  ? 'text-blue-600 hover:bg-blue-100'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              title={isShowImage ? 'hidden' : 'show'}
            >
              {isShowImage ? (
                <Image className="h-4 w-4" />
              ) : (
                <ImageOff className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="ml-4 flex items-center justify-center">
            <button
              onClick={() => setIsShowDefinition(!isShowDefinition)}
              className={`p-1 rounded transition-colors focus:outline-none ${
                isShowDefinition
                  ? 'text-blue-600 hover:bg-blue-100'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              title={isShowDefinition ? 'hidden' : 'show'}
            >
              <Languages className="h-4 w-4" />
            </button>
          </div>
        </div>
        <span className="text-xs text-default-400 font-medium">
          {ids && ids.length > 0 ? currentIndex + 1 : 0} / {ids?.length || 0}
        </span>
      </div>
    </div>
  )
}
