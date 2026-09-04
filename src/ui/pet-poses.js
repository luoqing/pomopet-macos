export const PET_POSES = [
  { value: 'focus', asset: 'focus', label: '安静陪专注' },
  { value: 'reward', asset: 'reward', label: '开心庆祝' },
  { value: 'ball', asset: 'ball', label: '叼球催动' },
  { value: 'sleepy', asset: 'sleepy', label: '困困提醒' },
  { value: 'fainted', asset: 'fainted', label: '原地装死' },
  { value: 'annoyed', asset: 'annoyed', label: '气鼓鼓' },
  { value: 'pet', asset: 'pet', label: '摸摸头' },
  { value: 'feed', asset: 'feed', label: '喂饼干' },
  { value: 'water', asset: 'water', label: '喝水提醒' },
  { value: 'comfort', asset: 'comfort', label: '挠肚皮' },
  { value: 'aggrieved', asset: 'aggrieved', label: '求安慰' },
  { value: 'angryStanding', asset: 'angry-standing', label: '气得跺脚' }
];

export const PET_POSE_LABELS = Object.fromEntries(PET_POSES.map((pose) => [pose.value, pose.label]));
export const PET_POSE_ASSETS = Object.fromEntries(PET_POSES.map((pose) => [pose.value, pose.asset]));
