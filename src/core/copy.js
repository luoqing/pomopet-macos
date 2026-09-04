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
  ambientCompanion: [
    { text: '我在。你可以继续忙，也可以摸我一下续个小电。', emotion: 'comfort' },
    { text: '巡逻结束：键盘正常，杯子正常，你也要正常喝水。', emotion: 'cute' },
    { text: '我刚刚安静陪了你一会儿。现在申请一个三秒钟眼神交流。', emotion: 'happy' }
  ],
  interactionPet: [{ text: '摸到头顶那撮毛了吗？那里今天负责接收好运。', emotion: 'cute' }, { text: '再摸一下，我就把今天的烦恼打包丢远一点。', emotion: 'happy' }],
  interactionFeed: [{ text: '嗷呜！饼干到账，陪伴服务立刻续费。', emotion: 'happy' }, { text: '这块我先替你尝尝。嗯，是“继续加油”味的。', emotion: 'cute' }],
  interactionBall: [{ text: '球来了！我冲！你负责夸，不许省略形容词。', emotion: 'happy' }, { text: '捡回来啦，还顺路捡回一点好心情。', emotion: 'cute' }],
  comfort: [{ text: '哈哈别挠啦……可以再挠三秒。三秒是我编的。', emotion: 'happy' }, { text: '肚皮开机成功，今天的难题先变小一点。', emotion: 'comfort' }]
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
