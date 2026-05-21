export const DEFAULT_BOOK_FILES = Object.freeze([
    {
        path: 'book/outline.md',
        content: '# 大纲\n\n这里不是正文，而是这本作品的路线图。\n\n可以先写：\n\n- 作品一句话定位：\n- 主线冲突：\n- 主要角色弧线：\n- 章节安排：\n- 暂时没想清楚的问题：\n',
    },
    {
        path: 'book/style.md',
        content: '# 文风规则\n\n这里记录“怎么写”，供写作助手续写和修订时参考。\n\n- 叙事视角：\n- 语气节奏：\n- 句子长度：\n- 禁忌与边界：\n- 想保留的例句：\n',
    },
    {
        path: 'book/characters.md',
        content: '# 角色设定\n\n这里记录人物，不是正文。\n\n- 角色名：\n  - 身份：\n  - 目标：\n  - 和其他人的关系：\n  - 当前变化：\n',
    },
    {
        path: 'book/world.md',
        content: '# 世界设定\n\n这里记录地点、规则、势力、时间线和重要物件。只写已经确定的内容，没确定的可以留空。\n',
    },
    {
        path: 'book/review-rules.md',
        content: '# 审稿规则\n\n这里记录这本书的审稿标准。审稿时优先按这里检查；如果你有特别偏好的审稿方式，可以直接改这个文件。\n\n- 结构：主线是否清楚，章节目标是否成立。\n- 人物：动机、关系、行为变化是否连贯。\n- 节奏：信息量、张力、转场和停顿是否合适。\n- 设定：世界观、时间线、地点和规则是否前后一致。\n- 文风：是否符合文风规则，是否有突兀语气。\n- 修改建议：优先给可执行的小改法，不做笼统评价。\n',
    },
    {
        path: 'book/chapters/001.md',
        content: '# 第 1 章\n\n从这里开始写正文。\n',
    },
    {
        path: 'book/notes/revision-plan.md',
        content: '# 修订计划\n\n这里放待办，不是正文。\n\n- [ ] 梳理大纲\n- [ ] 写第一章\n- [ ] 审稿并修订\n',
    },
]);
