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

  const fetchWordAllIds = useCallback(async () => {
    try {
      setIsLoading(true)
      setIds([])
      setWords([])
      // 切换模式或重来时，清空音频缓存标记
      audioCacheRef.current.clear()
      const res = await NotionWordAllIdsClient(dataSourceId)
      if (res.code === 200) {
        const resIds = res.data as string[]
        let ids = resIds
        if (!isOrder) {
          const shuffled = [...resIds]
          for (let i = shuffled.length - 1; i > 0; i--) {
            // 生成一个 0 到 i 之间的随机索引
            const j = Math.floor(Math.random() * (i + 1))
            // 交换元素
            ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
          }
          ids = shuffled
        }
        setIds(ids)
        if (ids && ids.length > 0) {
          // 🚀 核心：使用 slice(start, end) 截取前 10 个 ID
          // slice(0, 10) 会获取索引 0 到 9 的元素，刚好 10 个
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
            isPreloadingRef.current = true // 🔒 上锁，阻止随后的连续触发
            try {
              // 🚀 核心：使用 slice(start, end) 截取前 10 个 ID
              // slice(0, 10) 会获取索引 0 到 9 的元素，刚好 10 个
              const nextIds = ids.slice(words.length, words.length + 10)
              const res = await NotionWordGetByIdsClient(nextIds)
              if (res.code === 200) {
                const list = (res.data as WordType[]) || []
                if (list.length > 0) {
                  setWords((prev) => [...prev, ...list])
                }
              }
            } finally {
              isPreloadingRef.current = false // 🔓 开锁，允许下一次预加载
            }
          }
        }
      }
    }
    void getWords()
  }, [ids, currentIndex, words.length])

  // 🌟 核心新增：音频流自动预加载逻辑
  // 当 currentIndex 变更或列表更新时，自动向后预加载接下来的 3 个单词的音频
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

        // 先占位，防止重复 fetch
        audioCacheRef.current.set(url, 'loading')

        fetch(url)
          .then((res) => {
            if (!res.ok) throw new Error('Network response was not ok')
            return res.blob() // 关键：转成二进制对象
          })
          .then((blob) => {
            const blobUrl = URL.createObjectURL(blob) // 创建本地内存链接
            // 2. 如果超出了最大限制，淘汰掉最旧的那一个（Map 的第一个元素）
            if (cache.size >= MAX_CACHE_SIZE) {
              const oldestKey = cache.keys().next().value
              if (oldestKey) {
                const oldestUrl = cache.get(oldestKey)
                if (oldestUrl?.startsWith('blob:')) {
                  URL.revokeObjectURL(oldestUrl) // 💡 这一步至关重要！释放浏览器内存
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
            audioCacheRef.current.delete(url) // 失败了允许重试
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

      // 状态 1：如果正在播放相同的音频，则继续（或暂停，根据你的业务调)
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

      // 关键点：检查是否有预加载好的 Blob URL
      const cachedBlobUrl = audioCacheRef.current.get(audio_url)
      if (cachedBlobUrl && cachedBlobUrl !== 'loading') {
        globalAudio.src = cachedBlobUrl // 直接读取内存，0网速延迟！
      } else {
        globalAudio.src = audio_url // 降级：走网络请求
      }

      globalAudio.load()
      globalAudio.play().catch(() => {})
    },
    [activateAudioForIOS],
  )

  useEffect(() => {
    void playAudio(currentWord?.audio_url)
  }, [currentWord, playAudio])

  // 🌟 重新调校的原生滚动与强磁力补正逻辑
  const handleScroll = () => {
    const container = scrollContainerRef.current
    if (!container || isInternalScrollRef.current) return
    const { scrollLeft, clientWidth } = container
    if (clientWidth === 0) return

    // 1. 实时计算当前滑动到了第几张卡片（四舍五入）
    const newIndex = Math.round(scrollLeft / clientWidth)
    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < words.length) {
      setCurrentIndex(newIndex)
    }

    // 2. 🌟 核心防滑破防机制（处理滑到一半不动的情况）：
    // 当用户手指抬起，滚动开始变慢直至快停止时，如果它正好卡在中间，
    // 我们在 60ms 没有任何滚动事件后，人工强制触发一次 CSS 平滑磁吸对齐。
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)

    scrollTimeoutRef.current = setTimeout(() => {
      // 计算距离最近的一张卡片的标准对齐偏移量
      const targetScrollLeft = newIndex * clientWidth

      // 如果发现当前卡在中间（误差超过 2 像素），手动推它一把
      if (Math.abs(container.scrollLeft - targetScrollLeft) > 2) {
        isInternalScrollRef.current = true
        container.scrollTo({
          left: targetScrollLeft,
          behavior: 'smooth', // 启用平滑磁吸
        })

        // 动画结束后解锁
        setTimeout(() => {
          isInternalScrollRef.current = false
        }, 300)
      }
    }, 600) // 60ms 内不再发生滚动，说明用户手已经放开且滚动静止
  }
  const getFontSizeClass = (wordLength: number) => {
    if (wordLength > 15) return 'text-xl' // 超长单词 (如: incomprehensible)
    if (wordLength > 10) return 'text-2xl' // 较长单词 (如: beautiful, individual)
    if (wordLength > 7) return 'text-3xl' // 中等长度 (如: student)
    return 'text-4xl' // 短单词
  }

  if (isLoading && words.length === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center ">
        <Spinner color="current" />
      </div>
    )
  }

  return (
    <div className="w-full h-full  mx-auto flex flex-col overflow-hidden">
      {/* 🌟 卡片核心展示区：彻底去除任何 TS 不认识的 style 前缀属性 */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        // snap-x mandatory 声明横向磁吸对齐，no-scrollbar 隐藏原生的丑陋滚动条
        className="flex-1 flex flex-row overflow-x-auto overflow-y-hidden snap-x mandatory h-full w-full relative no-scrollbar"
        style={{
          // 仅保留完全合规的 iOS 原生滚动回弹加速，绝不加任何非标准的连字符属性
          WebkitOverflowScrolling: 'touch',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none', // Firefox 彻底隐藏
          msOverflowStyle: 'none', // IE / Edge 彻底隐藏
          // 针对 WebKit 内核（Chrome/Safari/iOS）的高级隐藏技巧
          ...({
            '&::webkitScrollbar': { display: 'none' },
          } as React.CSSProperties),
        }}
      >
        {words.map((word, index) => (
          <div
            key={`${word.id}-${index}`}
            // 层级 1：滑动视口轨道块（负责 snap 对齐和大小限制）
            className="w-full h-full shrink-0 snap-center snap-always px-4 pt-2 pb-3 box-border"
            style={{ contentVisibility: 'auto' }}
          >
            <div
              onClick={() => playAudio(word.audio_url)}
              className="w-full h-full flex flex-col items-center justify-center bg-gray-50 border border-gray-100 rounded-2xl pb-4 overflow-hidden
              shadow-md active:shadow-inner active:scale-[0.98] transition-all duration-75 select-none"
            >
              <div className="w-full flex justify-end items-center pl-3 pr-3 pt-2"></div>
              <div className="flex flex-1 items-center justify-center  pl-4 pr-4">
                <div>
                  <div className="text-center pointer-events-none">
                    {/* 1. 单词主体 */}
                    <p
                      className={`${getFontSizeClass(word.word?.length || 0)} font-bold text-warning tracking-wide break-words max-w-full transition-all duration-200`}
                    >
                      {word.word}
                    </p>

                    {/* 2. 音标 */}
                    {word.phonetic && (
                      <p className="text-sm font-medium text-neutral-400 mt-1.5 font-sans tracking-wide">
                        /{word.phonetic}/
                      </p>
                    )}
                  </div>
                  {/* 3. 辅助记忆图（同层级：在 flex-col 作用下自动向下排布，不受上面文字包裹层干扰） */}
                  {isShowImage && (
                    <>
                      {word.image_url && (
                        <div className="w-full flex items-center justify-center p-2 mt-2 overflow-hidden shrink bg-gray-50 pointer-events-none">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={word.image_url}
                            alt="Mnemonics"
                            decoding="async"
                            loading={
                              Math.abs(index - currentIndex) <= 1
                                ? 'eager'
                                : 'lazy'
                            }
                            className="object-cover rounded-lg"
                          />
                        </div>
                      )}
                    </>
                  )}

                  {/* 3. 翻译 */}
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
                  {index == words.length - 1 && (
                    <div className="pt-6 pb-2 pl-10 pr-10 w-full">
                      <Button
                        size="lg"
                        fullWidth={true}
                        onClick={() => doItAgain()}
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
          <div className="ml-3 flex items-center justify-center">
            <button
              onClick={() => setIsOrder(!isOrder)}
              className="text-blue-500 hover:text-blue-600 transition-colors focus:outline-none"
              title={
                isOrder ? '当前：正序（点击随机）' : '当前：随机（点击正序）'
              } // 增强可访问性
            >
              {isOrder ? (
                <ArrowDownAZ className="h-4 w-4" /> // 正序图标（A-Z 顺序）
              ) : (
                <Shuffle className="h-4 w-4" /> // 随机随机图标
              )}
            </button>
          </div>
          <div className="ml-5 flex items-center justify-center">
            <button
              onClick={() => setIsShowImage(!isShowImage)}
              className="text-blue-500 hover:text-blue-600 transition-colors focus:outline-none"
              title={isShowImage ? 'hidden' : 'show'}
            >
              {isShowImage ? (
                <Image className="h-4 w-4" /> // 显示状态
              ) : (
                <ImageOff className="h-4 w-4 text-gray-400" /> // 隐藏状态，变为灰色带斜线
              )}
            </button>
          </div>
          <div className="ml-4 flex items-center justify-center">
            <button
              onClick={() => setIsShowDefinition(!isShowDefinition)}
              className={`p-1 rounded transition-colors focus:outline-none ${
                isShowDefinition
                  ? 'text-blue-600 hover:bg-blue-100' // 开启翻译：高亮蓝色加淡蓝背景
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100' // 关闭翻译：低调灰色
              }`}
              title={isShowDefinition ? '隐藏翻译' : '显示翻译'}
            >
              <Languages className="h-4 w-4" />
            </button>
          </div>
        </div>
        <span className="text-xs text-default-400 font-medium">
          {ids?.length || 0 > 0 ? currentIndex + 1 : 0} / {ids?.length}
        </span>
      </div>
    </div>
  )
}
