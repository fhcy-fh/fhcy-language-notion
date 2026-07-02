'use client'

import React, { use, useCallback, useEffect, useRef, useState } from 'react'
import { Button, Spinner } from '@heroui/react'
import { House } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { WordType } from '@/src/types/WordTypes'
import {
  NotionWordAllIdsClient,
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
  const [errorKeys, setErrorKeys] = useState<Set<string>>(new Set()) // 用于记录当前震动闪红的卡片键

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
        setNextWords(toWordMatchItem(res.data || []))
      }
    },
    [limitCount],
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
        setCurrentWords(toWordMatchItem(res.data || []))
      }
    },
    [limitCount],
  )

  useEffect(() => {
    const initGameData = async () => {
      try {
        setIsLoading(true)
        // 1. 先获取所有的 IDs (内部直接调用客户端，不依赖外部 useCallback)
        setIds([])
        const res = await NotionWordAllIdsClient(dataSourceId)

        if (res.code === 200) {
          const ids = res.data as string[]
          setIds(ids)

          // 2. 拿到最新数据后，再紧接着获取当前轮和下一轮的数据
          // 注意：这里确保 fetchCurrentWords 内部使用的是刚拿到的 ids，而不是旧的 state
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

    // 拦截：如果是已消除的，或者正在做错误动画的，或者重复点击已经选中的，直接返回
    if (
      matchedIds.has(item.id) ||
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
    if (selectedCard.id === item.id) {
      // ✅ 配对成功
      const newMatched = new Set(matchedIds)
      newMatched.add(item.id)
      setMatchedIds(newMatched)
      setSelectedCard(null) // 清空选择框

      if (newMatched.size === currentWords.length / 2) {
        setTimeout(() => {
          setCurrentWords(nextWords)
          setMatchedIds(new Set())
          setSelectedCard(null)
          void fetchNextWords(ids || [])
        }, 400) // 延迟 400ms 让用户看清最后一次成功消除
      }
    } else {
      const currentSelectedKey = selectedCard.id + selectedCard.type
      setErrorKeys(new Set([currentSelectedKey, itemKey]))
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
      // 如果是同一个音频，且正在播放，再次点击则暂停
      if (globalAudio.src === audio_url && !globalAudio.paused) {
        globalAudio.play().catch(() => {})
        return
      }
      // 如果是同一个音频
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
    /* 🌟 核心：最外层必须是 flex flex-col 且高度满屏，这样内部的 flex-1 才能把高度平分铺满 */
    <div className="w-full h-full  mx-auto bg-neutral-50 flex flex-col overflow-hidden">
      {/* 🎮 游戏网格区：保留你的 grid-cols-2 和 grid-rows-5，配合 flex-1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 grid-rows-5 gap-2 w-full flex-1 pl-4 pr-4 pt-4 pb-2 overflow-hidden">
        {currentWords.map((item) => {
          const itemKey = item.id + item.type
          const isMatched = matchedIds.has(item.id)
          const isSelected = selectedCard === item
          const isError = errorKeys.has(itemKey)

          return (
            <div
              key={itemKey}
              onClick={() => handleCardClick(item)}
              /* 🌟 核心改变 2：最外层包裹节点必须是 h-full，才能撑满 grid 分配的 $\frac{1}{3}$ 高度 */
              className={`w-full h-full transition-all duration-200 
          ${isMatched ? 'invisible opacity-0 pointer-events-none' : ''}
          ${isError ? 'animate-shake' : ''}
        `}
            >
              {item.type === 'text' ? (
                /* 📝 单词卡片 - 彻底抛弃 h-28，改用 h-full 自动填充 */
                <div
                  className={`w-full h-full flex flex-col items-center justify-center border rounded-2xl p-3 shadow-sm active:scale-[0.98] transition-transform cursor-pointer select-none
              ${isError ? 'border-danger bg-danger-50 text-danger' : isSelected ? 'border-warning bg-amber-50 text-warning scale-[1.02]' : 'border-default-100 bg-white text-neutral-800'}
            `}
                  onClick={() => {
                    playAudio(item.word.audio_url)
                  }}
                >
                  <p className="font-bold tracking-wide break-all text-center">
                    {item.word.word}
                  </p>
                </div>
              ) : (
                /* 🖼️ 图片卡片 - 彻底抛弃 h-28，改用 h-full 自动填充 */
                <div
                  className={`w-full h-full border flex items-center justify-center rounded-2xl p-2 shadow-sm active:scale-[0.98] transition-transform cursor-pointer select-none overflow-hidden
              ${isError ? 'border-danger bg-danger-50' : isSelected ? 'border-warning bg-amber-50 scale-[1.02]' : 'border-default-100 bg-neutral-50'}
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
      <div className="mt-2 pt-1 pb-1 pl-4 pr-6 flex items-center justify-between shrink-0 border-t border-default-100  ">
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
