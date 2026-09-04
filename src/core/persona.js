export const PRESETS = {
  gentle: { label: '温柔陪伴' },
  witty: { label: '毒舌关心' },
  clever: { label: '机灵侠女' },
  sunny: { label: '元气夸夸' }
};

export const FREQUENCIES = {
  quiet: [45, 70],
  occasional: [20, 35],
  lively: [10, 20]
};

const DEFAULT_PERSONA = {
  preset: 'gentle',
  petName: '末末',
  ownerName: '主人',
  customPrompt: '',
  teaseLevel: 35,
  chatFrequency: 'occasional'
};

const LINES = {
  gentle: {
    alarm: {
      low: ['{ownerName}，{label}的时间到了。{petName}陪你慢慢来。'],
      medium: ['{ownerName}，先去{label}吧。{petName}在这里等你回来。'],
      high: ['{ownerName}，再忙也先顾好自己。{petName}提醒你{label}啦。']
    },
    focusComplete: {
      low: ['{ownerName}，{task}稳稳推进了，{petName}一直看在眼里。'],
      medium: ['{ownerName}把{task}做好了，{petName}替你悄悄高兴。'],
      high: ['{ownerName}，{task}这么难也拿下了，{petName}真为你骄傲。']
    },
    ambientCompanion: {
      low: ['{ownerName}安心忙吧，{petName}安静陪着你。'],
      medium: ['{ownerName}不用回应，{petName}只是来陪你一会儿。', '{ownerName}继续做手头的事，{petName}在旁边安静守着。'],
      high: ['{ownerName}别把自己忘在忙碌里，{petName}还在这里。']
    }
  },
  witty: {
    alarm: {
      low: ['{ownerName}，{label}到点了，{petName}这次只轻轻催一下。'],
      medium: ['{ownerName}，{label}可没学会自己完成，{petName}来提醒啦。'],
      high: ['{ownerName}，再拖下去{label}都要来催你了，听{petName}的。']
    },
    focusComplete: {
      low: ['{ownerName}居然把{task}推进了，{petName}决定认真夸你。'],
      medium: ['{task}都被{ownerName}拿下了，{petName}白担心一场。'],
      high: ['{ownerName}把{task}啃完了，行吧，{petName}准你得意一会儿。']
    },
    ambientCompanion: {
      low: ['{ownerName}继续忙，{petName}只是路过检查你有没有偷累。'],
      medium: ['{ownerName}忙得很像回事，{petName}先在旁边替你看着。'],
      high: ['{ownerName}还没把自己忙丢吧？{petName}来点个名。']
    }
  },
  clever: {
    alarm: {
      low: ['{ownerName}，{label}的时辰到了，{petName}前来报信。'],
      medium: ['{ownerName}，{label}这件小事，{petName}掐准时辰提醒你。'],
      high: ['{ownerName}莫再恋战，先去{label}，{petName}替你守住阵地。']
    },
    focusComplete: {
      low: ['{ownerName}拿下了{task}，{petName}佩服得很。'],
      medium: ['{task}已破，{ownerName}这一招漂亮，{petName}记下了。'],
      high: ['{ownerName}连{task}都攻下了，{petName}甘愿认输半刻。']
    },
    ambientCompanion: {
      low: ['{ownerName}安心做事，{petName}在旁边替你望风。'],
      medium: ['{ownerName}专心赶路，{petName}守着这一小方桌面。'],
      high: ['{ownerName}只管出招，累了便退到{petName}这里歇一歇。']
    }
  },
  sunny: {
    alarm: {
      low: ['{ownerName}，{label}时间到！{petName}给你加一点行动力。'],
      medium: ['{ownerName}出发去{label}啦，{petName}已经替你鼓掌了！'],
      high: ['{ownerName}现在就去{label}，{petName}相信你说动就动！']
    },
    focusComplete: {
      low: ['{ownerName}完成了{task}，{petName}看见这个进展啦！'],
      medium: ['{task}漂亮收尾，{ownerName}今天又向前一步！{petName}超开心！'],
      high: ['{ownerName}拿下{task}啦！{petName}要把这份厉害大声记住！']
    },
    ambientCompanion: {
      low: ['{ownerName}继续加油，{petName}在旁边给你一点小小阳光！'],
      medium: ['{ownerName}已经做得很好啦，{petName}来送一份好心情！'],
      high: ['{ownerName}今天也在认真向前！{petName}必须来夸一下！']
    }
  }
};

export const defaultPersona = () => ({ ...DEFAULT_PERSONA });

export function normalizePersona(value = {}) {
  const preset = Object.hasOwn(PRESETS, value?.preset) ? value.preset : DEFAULT_PERSONA.preset;
  const petName = normalizeText(value?.petName, DEFAULT_PERSONA.petName, 12);
  const ownerName = normalizeText(value?.ownerName, DEFAULT_PERSONA.ownerName, 12);
  const customPrompt = String(value?.customPrompt || '').trim().slice(0, 500);
  const numericTease = Number(value?.teaseLevel);
  const teaseLevel = Number.isFinite(numericTease) ? Math.round(Math.min(100, Math.max(0, numericTease))) : DEFAULT_PERSONA.teaseLevel;
  const chatFrequency = Object.hasOwn(FREQUENCIES, value?.chatFrequency) ? value.chatFrequency : DEFAULT_PERSONA.chatFrequency;
  return { preset, petName, ownerName, customPrompt, teaseLevel, chatFrequency };
}

export function teaseBucket(value) {
  const level = Math.min(100, Math.max(0, Number(value) || 0));
  if (level <= 30) return 'low';
  if (level <= 70) return 'medium';
  return 'high';
}

export function fallbackLine(scene, context = {}, random = Math.random) {
  const persona = normalizePersona(context.persona);
  const sceneLines = LINES[persona.preset][scene] || LINES[persona.preset].ambientCompanion;
  const options = sceneLines[teaseBucket(persona.teaseLevel)];
  const index = Math.min(options.length - 1, Math.max(0, Math.floor(normalizeRandom(random()) * options.length)));
  const values = {
    petName: persona.petName,
    ownerName: persona.ownerName,
    label: normalizeText(context.label, '看看提醒', 40),
    task: normalizeText(context.task, '这件事', 60)
  };
  return options[index].replace(/\{(petName|ownerName|label|task)\}/g, (_, key) => values[key]);
}

function normalizeText(value, fallback, maxLength) {
  return String(value || '').trim().slice(0, maxLength) || fallback;
}

function normalizeRandom(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(0.999999, Math.max(0, numeric)) : 0;
}
