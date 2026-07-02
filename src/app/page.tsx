'use client'

import { Button, Spinner } from '@heroui/react'
import { useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'
import { RedoDot, Spline } from 'lucide-react'
import { NotionBookClient } from '@/src/client/BookClient'
import { BookType } from '@/src/types/BookTypes'
import { NotionBaseClient } from '@/src/client/BaseClient'
import { BaseInfoType } from '@/src/types/CommonTypes'

export default function HomePage() {
  const router = useRouter()

  const [isPendingWordSwipe, setIsPendingWordSwipe] = useState(false)
  const [isPendingWordMatch, setIsPendingWordMatch] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const [pendingBookId, setPendingBookId] = useState<string | null>(null)
  const [books, setBooks] = useState<BookType[]>()
  const [baseInfo, setBaseInfo] = useState<BaseInfoType>()
  const [currentRouter, setCurrentRouter] = useState<string>()

  // 初始化数据
  useEffect(() => {
    const fetchBooks = async () => {
      const res = await NotionBookClient()
      if (res.code === 200) {
        const books = res.data as BookType[]
        setBooks(books)
      }
    }
    const fetchBaseInfo = async () => {
      const baseInfoRes = await NotionBaseClient()
      if (baseInfoRes.code === 200) {
        const baseInfo = baseInfoRes.data as BaseInfoType
        setBaseInfo(baseInfo)
      }
    }
    const init = async () => {
      try {
        setIsLoading(true)
        void fetchBooks()
        await fetchBaseInfo()
      } finally {
        setIsLoading(false)
      }
    }
    void init()
  }, [])

  const handle = (currentRouter: string) => {
    if (books?.length === 1) {
      router.push(currentRouter + '/' + books[0].data_source_id)
    } else {
      setCurrentRouter(currentRouter)
      setIsOpen(true)
    }
  }

  // 关闭抽屉并重置状态的通用函数
  const handleCloseDrawer = () => {
    setIsOpen(false)
    setIsPendingWordSwipe(false)
    setIsPendingWordMatch(false)
  }

  // --- 新增：手势交互状态与引用 ---
  const bodyRef = useRef<HTMLDivElement>(null)
  const touchStartY = useRef(0)
  const [currentTranslateY, setCurrentTranslateY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  // 1. 触摸开始
  const handleTouchStart = (e: React.TouchEvent) => {
    // 只有当内容区滚动到最顶部时，才允许触发下拉关闭
    if (bodyRef.current && bodyRef.current.scrollTop > 0) return

    touchStartY.current = e.touches[0].clientY
    setIsDragging(true)
  }

  // 2. 触摸移动
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return

    const currentY = e.touches[0].clientY
    const deltaY = currentY - touchStartY.current

    // 只允许向下划（deltaY > 0）
    if (deltaY > 0) {
      setCurrentTranslateY(deltaY)
    }
  }

  // 3. 触摸结束
  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)

    // 如果下拉距离超过 80 像素，直接触发关闭
    if (currentTranslateY > 80) {
      handleCloseDrawer()
    }

    // 复位位移
    setCurrentTranslateY(0)
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center ">
        <Spinner color="current" />
      </div>
    )
  }

  return (
    <div className="w-full min-h-screen max-w-md mx-auto px-5 flex flex-col justify-center items-center gap-8 box-border">
      {/* 头部区域 */}
      {baseInfo?.title && (
        <div className="w-full text-center flex flex-col gap-2 select-none animate-fade-in">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
            {baseInfo?.title || ''}
          </h1>
          <p className="text-sm sm:text-base text-gray-500 max-w-xs mx-auto leading-relaxed">
            {baseInfo?.description ||
              'A beautifully simple way to practice, retain, and conquer new vocabulary.'}
          </p>
        </div>
      )}
      <div className="w-full flex flex-col gap-4 box-border pb-20">
        <Button
          size="lg"
          variant="tertiary"
          fullWidth={true}
          className="bg-white text-black font-medium shadow-sm hover:bg-default-100 transition-colors duration-200"
          onPress={() => {
            setIsPendingWordSwipe(true)
            handle('/wordSwipe')
          }}
          isPending={isPendingWordSwipe}
        >
          {({ isPending }) => (
            <>
              {isPending ? <Spinner color="current" size="sm" /> : <RedoDot />}
              Word Swipe
            </>
          )}
        </Button>

        <Button
          size="lg"
          variant="tertiary"
          fullWidth={true}
          className="bg-white text-black font-medium shadow-sm hover:bg-default-100 transition-colors duration-200"
          onPress={() => {
            setIsPendingWordMatch(true)
            handle('/wordMatch')
          }}
          isPending={isPendingWordMatch}
        >
          {({ isPending }) => (
            <>
              {isPending ? <Spinner color="current" size="sm" /> : <Spline />}
              Word Match
            </>
          )}
        </Button>

        {/* --- 底部抽屉全套（不采用条件渲染，改用类名控制，保留滑入滑出动画） --- */}
        <div
          className={`fixed inset-0 z-50 transition-all duration-300 ${
            isOpen ? 'visible' : 'invisible pointer-events-none'
          }`}
        >
          {/* 1. Backdrop (背景遮罩) */}
          <div
            className={`fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
              isOpen ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={handleCloseDrawer}
          />

          {/* 2. Drawer Content (从底部滑出，占据 3/4 高度) */}
          <div
            // 💡 绑定手势事件
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={`
              fixed bottom-0 left-0 right-0 z-50 
              h-auto max-h-[85vh] w-full max-w-md mx-auto
              bg-white rounded-t-2xl shadow-2xl 
              flex flex-col 
              ${isDragging ? '' : 'transition-transform duration-300 ease-out'}
            `}
            // 💡 动态内联样式：拖拽时跟随手指移动，松手时如果是关闭则交由原本的 CSS 处理
            style={{
              transform: isOpen
                ? `translateY(${currentTranslateY}px)`
                : 'translateY(100%)',
            }}
          >
            {/* 小把手 (Hint Bar) —— 增加底部抽屉的移动端视觉暗示 */}
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto my-3 flex-shrink-0 cursor-grab active:cursor-grabbing" />

            {/* 3. Header (头部) */}
            <div className="flex items-center justify-center pb-4 px-4 border-b border-gray-100 flex-shrink-0 select-none">
              <h2 className="text-lg font-semibold text-gray-900">
                Choose Vocabulary Book
              </h2>
            </div>

            {/* 4. Body (滚动内容区) */}
            <div
              ref={bodyRef} // 💡 绑定 ref 用来判断滚动条是否在最顶部
              className="flex-1 overflow-y-auto pl-5 pr-5 pt-8 pb-10 flex flex-col gap-4"
            >
              {books?.map((book) => {
                const isCurrentBookPending = pendingBookId === book.id
                return (
                  <Button
                    key={book.id}
                    size="lg"
                    variant="tertiary"
                    fullWidth={true}
                    className="bg-white text-black font-medium shadow-sm hover:bg-default-100 transition-colors duration-200 flex items-center"
                    onPress={() => {
                      setPendingBookId(book.id)
                      router.push(currentRouter + '/' + book.data_source_id)
                    }}
                    isPending={isCurrentBookPending}
                    isDisabled={pendingBookId !== null && !isCurrentBookPending}
                  >
                    {() => (
                      <>
                        {isCurrentBookPending ? (
                          <Spinner color="current" size="sm" />
                        ) : (
                          <>
                            {book?.icon ? (
                              <img
                                src={book.icon}
                                alt="Icon"
                                decoding="async"
                                className="w-4 h-4 object-cover rounded-lg shrink-0"
                              />
                            ) : (
                              <RedoDot />
                            )}
                          </>
                        )}
                        {book?.name || 'Word Swipe'}
                      </>
                    )}
                  </Button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
