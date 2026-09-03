'use client'

import {cn} from '@/lib/utils'
import {Button} from '@/components/ui/button'

/** 首页推荐问题 / 任务（改这里即可，无需接口） */
const SUGGESTED_QUESTIONS = [
    '与最高的建筑相比，埃菲尔铁塔有多高？',
    'GitHub上最热门的存储库有哪些？',
    '如何看待中国的外卖大战？',
    '超加工食品与健康有关吗？超加工食品的历史怎样？',
] as const

interface SuggestedQuestionsProps {
    className?: string
    /** 点击推荐项时回调，参数为推荐文案 */
    onSelect?: (question: string) => void
}

export function SuggestedQuestions({className, onSelect}: SuggestedQuestionsProps) {
    return (
        <div className={cn('flex flex-wrap gap-2', className)}>
            {SUGGESTED_QUESTIONS.map((question) => (
                <Button
                    key={question}
                    type="button"
                    variant="outline"
                    className="cursor-pointer"
                    onClick={() => onSelect?.(question)}
                >
                    {question}
                </Button>
            ))}
        </div>
    )
}
