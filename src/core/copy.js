export const COPY = {
  focusStart: [
    { text: '你负责专注，我负责趴好。今天谁先乱动谁是小狗。', emotion: 'cute' },
    { text: '把这件小事交给接下来的自己，我在旁边给你守门。', emotion: 'comfort' },
    { text: '番茄已开。焦虑请在门口排队，暂不接待。', emotion: 'sarcastic' }
  ],
  focusComplete: [
    { text: '做完啦！我宣布这颗番茄具有重大科研价值。', emotion: 'happy', voice: 'focus-complete' },
    { text: '漂亮！奖励你一枚看不见但沉甸甸的小勋章。', emotion: 'happy', voice: 'focus-complete' },
    { text: '完成得这么利落，我刚准备的担心都白担心了。', emotion: 'cute', voice: 'focus-complete' }
  ],
  break: [
    { text: '起来走两步吧，你的脖子已经在提交离职申请了。', emotion: 'cute', voice: 'break' },
    { text: '眼睛借我保管五分钟。你去看看窗外有没有云。', emotion: 'comfort', voice: 'break' },
    { text: '休息不是偷懒，是给下一颗番茄浇水。走，去喝口水。', emotion: 'cute', voice: 'break' }
  ],
  alarm: [
    { text: '叮！你托我记住的时间到了，我一秒都没偷吃。', emotion: 'happy', voice: 'alarm' },
    { text: '到点啦！这是你过去的自己寄来的加急小纸条。', emotion: 'cute', voice: 'alarm' },
    { text: '报告：闹钟已到站。请带好随身物品和清醒的大脑。', emotion: 'sarcastic', voice: 'alarm' }
  ],
  offwork: [
    { text: '下班啦。再不走，我就躺在桌面上碰瓷。', emotion: 'sleepy', voice: 'offwork' },
    { text: '今天的你已经够努力了，剩下的交给明天那个你。', emotion: 'comfort', voice: 'offwork' },
    { text: '电脑没有家，但你有。收工，回去好好生活。', emotion: 'sleepy', voice: 'offwork' }
  ],
  ignored: [
    { text: '我叼着球等了好久。没关系，再给你五分钟。', emotion: 'comfort' },
    { text: '你继续装忙，我继续鼓腮。我们都有光明的未来。', emotion: 'angry' },
    { text: '很好，我已正式躺平。需要我的时候请翻面。', emotion: 'sarcastic' }
  ],
  interactionPet: [{ text: '嗯……这里可以再摸两下。我批准了。', emotion: 'cute' }, { text: '脑袋被摸亮了，今天会有好事。', emotion: 'happy' }],
  interactionFeed: [{ text: '嗷呜！这口算你的今日最佳投资。', emotion: 'happy' }, { text: '吃到了。现在我可以继续认真陪你了。', emotion: 'cute' }],
  interactionBall: [{ text: '看好啦！本宠的短跑纪录只对你公开。', emotion: 'happy' }, { text: '球捡回来啦，顺便捡回一点好心情。', emotion: 'cute' }],
  comfort: [{ text: '今天不用表现得很厉害。先坐一会儿，我陪你。', emotion: 'comfort' }, { text: '你可以慢一点。事情很多，但你只有一个。', emotion: 'comfort' }]
};

export class CopyPicker {
  constructor(last = {}, random = Math.random) { this.last = { ...last }; this.random = random; }
  pick(category) {
    const options = COPY[category]; if (!options?.length) return { text: '', emotion: 'cute' };
    const allowed = options.map((item, index) => ({ item, index })).filter(({ index }) => index !== this.last[category]);
    const choice = allowed[Math.floor(this.random() * allowed.length)] || { item: options[0], index: 0 };
    this.last[category] = choice.index; return { ...choice.item };
  }
  snapshot() { return { ...this.last }; }
}
