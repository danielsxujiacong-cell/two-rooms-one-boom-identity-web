const ROLE_COLORS = {
  blue: { label: "蓝队", emoji: "🔵" },
  red: { label: "红队", emoji: "🔴" },
  gray: { label: "独立", emoji: "⚪" },
  green: { label: "绿色特殊", emoji: "🟢" },
  purple: { label: "紫色特殊", emoji: "🟣" },
};

function role(id, nameZh, nameEn, allegiance, cardColor, ability, maxCount, isAdvanced) {
  return {
    id,
    nameZh,
    nameEn,
    allegiance,
    cardColor,
    ability,
    maxCount: maxCount || 1,
    isAdvanced: isAdvanced === true,
  };
}

const roles = [
  role("president", "总统", "President", "blue", "blue", "蓝队核心角色。游戏结束时若总统没有因炸弹客而死亡，蓝队达成基础胜利条件。", 1, false),
  role("bomber", "炸弹客", "Bomber", "red", "red", "红队核心角色。游戏结束时若与总统处于同一房间，总统死亡，红队达成基础胜利条件。", 1, false),
  role("blue_team", "蓝队队员", "Blue Team", "blue", "blue", "蓝队普通成员，与蓝队共享基础胜利条件。", 40, false),
  role("red_team", "红队队员", "Red Team", "red", "red", "红队普通成员，与红队共享基础胜利条件。", 40, false),
  role("gambler", "赌徒", "Gambler", "gray", "gray", "最终公开身份前，公开预测本局获胜方是红队、蓝队或两者皆非；预测正确才获胜。", 1, false),
];

const pairedRoles = [
  ["agent", "特工", "Agent", "每轮一次，向一名玩家私下展示自己的身份，并强制该玩家与你完整交换身份信息。"],
  ["ambassador", "大使", "Ambassador", "拿到身份后立即公开身份，并永久公开。具有免疫状态，不受角色能力和状态影响。可自由在两房之间移动，不计入房间人数，也不能投票、成为领袖或人质。"],
  ["angel", "天使", "Angel", "拥有“诚实”状态。所有口头说出的内容必须是真话。"],
  ["blind", "盲人", "Blind", "拥有“失明”状态，游戏过程中应尽力保持闭眼。"],
  ["bouncer", "门卫", "Bouncer", "如果自己所在房间人数多于另一房，可向一名玩家私下展示身份并命令其立即前往另一房。最后一轮以及轮次之间不可使用。"],
  ["clown", "小丑", "Clown", "整个游戏过程中尽力保持微笑。"],
  ["conman", "骗子", "Conman", "当另一名玩家同意与你进行颜色分享时，你可以改为双方私下完整展示身份。"],
  ["coy_boy", "腼腆少年", "Coy Boy", "拥有“腼腆”状态。只能进行颜色分享，除非被其他角色能力强制进行完整身份分享。"],
  ["criminal", "罪犯", "Criminal", "任何与你完整分享身份的玩家都会获得“害羞”状态。害羞玩家不能主动展示自己身份牌的任何部分。"],
  ["dealer", "庄家", "Dealer", "任何与你完整分享身份的玩家都会获得“愚蠢”状态。愚蠢玩家不能拒绝别人提出的身份分享或颜色分享。"],
  ["demon", "恶魔", "Demon", "拥有“说谎”状态。所有口头说出的内容必须是假话。"],
  ["enforcer", "执行者", "Enforcer", "每轮一次，向两名玩家私下展示自己的身份，并强制这两名玩家彼此完整分享身份。"],
  ["immunologist", "免疫学家", "Immunologist", "拥有“免疫”状态。免疫所有角色能力以及所有状态效果。"],
  ["mayor", "市长", "Mayor", "当自己所在房间人数为偶数时，在罢免领袖投票中可以公开身份。公开后自己的一票计为两票；若对方市长也公开，则不获得双票优势。"],
  ["medic", "医护兵", "Medic", "任何与你完整分享身份的玩家都会清除其身上的所有状态。你自己不会因此获得免疫。"],
  ["mime", "哑剧演员", "Mime", "整个游戏过程中尽力不发出声音。"],
  ["mummy", "木乃伊", "Mummy", "任何与你完整分享身份的玩家都会获得“诅咒”状态。被诅咒玩家应尽力保持安静，并不能使用需要口头宣告的角色能力。"],
  ["negotiator", "谈判专家", "Negotiator", "拥有“精明”状态。只能进行完整身份分享；不能公开展示、私下展示或只分享颜色。"],
  ["paparazzo", "狗仔", "Paparazzo", "尽力阻止其他玩家进行私下交谈，尽可能打探和介入秘密谈话。不要涉及任何身体强制行为。"],
  ["paranoid", "偏执狂", "Paranoid", "只能进行完整身份分享，而且整局只能主动完整分享一次。被其他角色能力强制分享不计入这一次限制。"],
  ["psychologist", "心理学家", "Psychologist", "当你向一名拥有心理状态的玩家私下展示身份时，对方可以立刻与你完整分享身份；若这么做，则移除该玩家的心理状态。"],
  ["security", "安保", "Security", "每局一次，公开自己的身份并指定同房的一名其他玩家。该玩家本轮不能被作为人质交换。使用后你的身份永久公开。"],
  ["shy_guy", "害羞小子", "Shy Guy", "拥有“害羞”状态。不能向任何玩家展示身份牌的任何部分。"],
  ["spy", "间谍", "Spy", "真实阵营与身份牌表面颜色相反。"],
  ["thug", "暴徒", "Thug", "任何与你完整分享身份的玩家都会获得“腼腆”状态，之后只能进行颜色分享。"],
  ["usurper", "篡位者", "Usurper", "最后一轮之前，每局一次，可以公开自己的身份并立即成为房间领袖。本轮不能再被罢免。此后身份永久公开。"],
];

for (const [key, nameZh, nameEn, ability] of pairedRoles) {
  for (const team of ["blue", "red"]) {
    const cardColor = key === "spy" ? (team === "blue" ? "red" : "blue") : team;
    roles.push(role(`${team}_${key}`, nameZh, nameEn, team, cardColor, ability, 1, true));
  }
}

const exclusiveRoles = [
  ["red", "cupid", "丘比特", "Cupid", "每局一次，向两名玩家私下展示身份并指定他们“相爱”。两人的原胜利条件被替换为：游戏结束时必须处于同一房间。"],
  ["red", "dr_boom", "砰砰博士", "Dr. Boom", "如果与总统进行完整身份分享，自己所在房间的玩家立即死亡，游戏立刻结束。该能力不对“总统女儿”生效；总统被埋葬时也不会触发此能力。"],
  ["red", "engineer", "工程师", "Engineer", "加入工程师时，红队增加一个额外胜利条件：游戏结束前，炸弹客必须与工程师完整分享身份，否则红队失败。"],
  ["red", "martyr", "殉道者", "Martyr", "炸弹客的后备角色。若炸弹客牌被埋葬，殉道者承担炸弹客的全部职责。"],
  ["red", "tinkerer", "修补匠", "Tinkerer", "工程师的后备角色。若工程师牌被埋葬，修补匠承担工程师的全部职责。"],
  ["blue", "doctor", "医生", "Doctor", "加入医生时，蓝队增加一个额外胜利条件：游戏结束前，总统必须与医生完整分享身份，否则蓝队失败。"],
  ["blue", "eris", "厄里斯", "Eris", "每局一次，向两名玩家私下展示身份并指定他们“互相憎恨”。两人的原胜利条件被替换为：游戏结束时必须位于不同房间。"],
  ["blue", "nurse", "护士", "Nurse", "医生的后备角色。若医生牌被埋葬，护士承担医生的全部职责。"],
  ["blue", "presidents_daughter", "总统女儿", "President's Daughter", "总统的后备角色。若总统牌被埋葬，总统女儿承担总统的全部职责。"],
  ["blue", "tuesday_knight", "星期二骑士", "Tuesday Knight", "如果与炸弹客完整分享身份，自己所在房间中除总统以外的玩家立即死亡，游戏立刻结束。该能力不对殉道者生效；炸弹客被埋葬时也不会触发此能力。"],
  ["gray", "agoraphobe", "广场恐惧者", "Agoraphobe", "从游戏开始到结束从未离开自己的初始房间，则获胜。"],
  ["gray", "ahab", "亚哈", "Ahab", "游戏结束时，莫比与炸弹客同房，而自己不在该房间，则获胜。"],
  ["gray", "anarchist", "无政府主义者", "Anarchist", "在大多数轮次中，你的投票都参与并成功罢免了房间领袖，则获胜。"],
  ["gray", "bomb_bot", "炸弹机器人", "Bomb-Bot", "游戏结束时与炸弹客同房，但总统不在该房间，则获胜。"],
  ["gray", "butler", "管家", "Butler", "游戏结束时与女仆和总统三人处于同一房间，则获胜。"],
  ["gray", "clone", "克隆人", "Clone", "你第一次进行完整身份分享或颜色分享的玩家最终获胜，你才获胜。整局没有与任何人分享则失败。"],
  ["gray", "decoy", "诱饵", "Decoy", "最后一轮结束时被狙击手选中射击，则获胜。"],
  ["gray", "hot_potato", "烫手山芋", "Hot Potato", "任何与你进行完整身份分享或颜色分享的人，立即与你交换角色牌。双方承担新角色的阵营和能力。“烫手山芋”这一角色本身在游戏结束时失败。"],
  ["gray", "intern", "实习生", "Intern", "游戏结束时与总统处于同一房间，则获胜。"],
  ["gray", "juliet", "朱丽叶", "Juliet", "游戏结束时同时与罗密欧和炸弹客处于同一房间，则获胜。"],
  ["gray", "maid", "女仆", "Maid", "游戏结束时同时与管家和总统处于同一房间，则获胜。"],
  ["gray", "mastermind", "幕后主脑", "Mastermind", "游戏结束时自己是某一房间的领袖，并且游戏过程中曾经担任过另一房间的领袖，则获胜。"],
  ["gray", "mi6", "军情六处", "MI6", "游戏结束前分别与总统和炸弹客完整分享过身份，则获胜。"],
  ["gray", "minion", "爪牙", "Minion", "在游戏过程中，只要你所在的房间从未成功罢免过领袖，则获胜。"],
  ["gray", "mistress", "情妇", "Mistress", "游戏结束时与总统处于同一房间，同时妻子不在该房间，则获胜。"],
  ["gray", "moby", "莫比", "Moby", "游戏结束时，亚哈与炸弹客同房，而自己不在该房间，则获胜。"],
  ["gray", "nuclear_tyrant", "核暴君", "Nuclear Tyrant", "如果游戏结束前，总统和炸弹客没有都与你完整分享身份，你获胜，并且其他所有玩家全部失败。开局拥有“愚蠢”状态。"],
  ["gray", "private_eye", "私家侦探", "Private Eye", "最终公开角色之前，公开猜测被埋葬的角色。猜对才获胜。"],
  ["gray", "queen", "女王", "Queen", "游戏结束时既不与总统同房，也不与炸弹客同房，则获胜。"],
  ["gray", "rival", "竞争者", "Rival", "游戏结束时不与总统同房，则获胜。"],
  ["gray", "robot", "机器人", "Robot", "你第一次进行完整身份分享或颜色分享的玩家最终未能完成其全部胜利条件，你才获胜。整局没有分享则失败。"],
  ["gray", "romeo", "罗密欧", "Romeo", "游戏结束时同时与朱丽叶和炸弹客处于同一房间，则获胜。"],
  ["gray", "sniper", "狙击手", "Sniper", "最后一轮结束、公开所有身份前，公开指定射击一名玩家。如果射中的玩家是“目标”，你获胜。"],
  ["gray", "survivor", "幸存者", "Survivor", "游戏结束时不与炸弹客处于同一房间，则获胜。"],
  ["gray", "target", "目标", "Target", "最后一轮结束时没有被狙击手射中，则获胜。"],
  ["gray", "traveler", "旅行者", "Traveler", "在超过半数的轮次结束时，都作为人质被送往另一房间，则获胜。"],
  ["gray", "victim", "受害者", "Victim", "游戏结束时与炸弹客处于同一房间，则获胜。"],
  ["gray", "wife", "妻子", "Wife", "游戏结束时与总统处于同一房间，同时情妇不在该房间，则获胜。"],
  ["green", "leprechaun", "爱尔兰小精灵", "Leprechaun", "开局拥有“愚蠢”状态。任何与你进行颜色分享或完整身份分享的人都会立即与你交换角色牌。双方获得新身份的阵营和能力。游戏结束时，爱尔兰小精灵角色获胜。同一名玩家整局不能第二次成为爱尔兰小精灵。"],
  ["green", "zombie", "僵尸", "Zombie", "开局拥有“僵尸”状态。与带有僵尸状态的玩家进行完整身份分享或颜色分享，会感染僵尸状态。僵尸队胜利条件：游戏结束时，所有仍然活着的玩家全部属于僵尸队。"],
  ["purple", "drunk", "醉汉", "Drunk", "发牌前先随机移除一张角色牌作为“清醒身份”。再把醉汉加入牌库进行发牌。最后一轮开始时，醉汉与“清醒身份”交换角色，并承担该角色的能力、阵营和职责。若未能完成交换，醉汉失败。"],
];

for (const [allegiance, key, nameZh, nameEn, ability] of exclusiveRoles) {
  roles.push(role(`${allegiance}_${key}`, nameZh, nameEn, allegiance, allegiance, ability, 1, true));
}

const ROLE_BY_ID = roles.reduce((result, item) => {
  result[item.id] = item;
  return result;
}, {});

module.exports = {
  ROLE_COLORS,
  roles,
  ROLE_BY_ID,
};
