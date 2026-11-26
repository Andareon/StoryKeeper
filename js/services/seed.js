import { createCampaign, openCampaign } from '../db/campaign.js'
import { getCampaignRecord } from '../db/registry.js'
import {
  normalizeCharacter,
  normalizeClue,
  normalizeLocation,
  normalizeNote,
  normalizePlayer,
  normalizeRelation,
  normalizeSession,
} from '../domain.js'

const STORY = {
  name: 'Дом на Вересковой улице',
  description: 'Расследование на одну-две сессии. Ночью в особняке Вересков погас свет, а к утру пропала Клара. Дверь была заперта изнутри, и трое оставшихся рассказывают эту ночь по-разному.',
}

export async function createSampleCampaign() {
  const created = await createCampaign({
    name: STORY.name,
    description: STORY.description,
    status: 'active',
  })
  const db = await openCampaign(created.id)
  try {
    const cover = await db.putImage(svgImage('Вересковая улица', '#2a2433', false))
    const agathaPortrait = await db.putImage(svgImage('АГ', '#3f3348'))
    const leonPortrait = await db.putImage(svgImage('ЛВ', '#3d4654'))
    const irmaPortrait = await db.putImage(svgImage('ИС', '#3d4a40'))
    const claraPortrait = await db.putImage(svgImage('КВ', '#4a3a3a'))
    const adaPortrait = await db.putImage(svgImage('АК', '#3e4a55'))
    const timPortrait = await db.putImage(svgImage('ТБ', '#4a4538'))
    const meta = await db.getMeta()
    await db.putMeta({ ...meta, coverImageId: cover.id, status: 'active', description: STORY.description })

    const street = 'loc-street'
    const hall = 'loc-hall'
    const library = 'loc-library'
    const greenhouse = 'loc-greenhouse'
    const cellar = 'loc-cellar'
    const agatha = 'npc-agatha'
    const leon = 'npc-leon'
    const irma = 'npc-irma'
    const clara = 'npc-clara'
    const letter = 'clue-letter'
    const key = 'clue-key'
    const soil = 'clue-soil'
    const diary = 'clue-diary'
    const vial = 'clue-vial'
    const ticket = 'clue-ticket'
    const herb = 'clue-herb'
    const maria = 'pc-maria'
    const pavel = 'pc-pavel'

    const locations = [
      normalizeLocation({
        id: street,
        name: 'Вересковая улица',
        shortDescription: 'Мокрая мощёная улица, один фонарь и закрытые ворота особняка.',
        gmDescription: 'Фонарь мигает не из-за ветра: кто-то недавно задевал провод. На калитке свежая царапина от металла, не от ключа.',
        notes: 'Если партия застряла, инспектор ждёт у фонаря и может назвать время, когда свет в доме погас.',
        characterIds: [],
        linkedLocationIds: [hall],
        tags: ['город', 'ночь'],
        secrets: [{ id: 'sec-wire', text: 'Провод фонаря оборван изнутри двора, не с улицы.', revealed: false }],
        events: [],
      }),
      normalizeLocation({
        id: hall,
        name: 'Холл особняка',
        shortDescription: 'Тёмный холл, мокрый ковёр и портрет семьи над лестницей.',
        gmDescription: 'Ковёр принесли из оранжереи уже после полуночи. Портрет чуть отходит от стены: за ним пустой конверт.',
        notes: 'Не говорить про конверт, пока портрет не сдвинут.',
        characterIds: [agatha, leon],
        linkedLocationIds: [street, library, cellar],
        tags: ['дом'],
        secrets: [{ id: 'sec-portrait', text: 'За портретом спрятан пустой конверт с запахом чернил Клары.', revealed: false }],
        events: [{ id: 'ev-lights', title: 'Свет гаснет снова', text: 'Если спорят дольше десяти минут, в доме снова гаснет свет.', happened: false }],
      }),
      normalizeLocation({
        id: library,
        name: 'Библиотека',
        shortDescription: 'Высокие полки, холодный камин и кресло у окна.',
        gmDescription: 'Дневник лежит не на столе, а за рядом гербариев. Письмо без подписи вставлено в книгу о ночных поездах.',
        characterIds: [clara],
        linkedLocationIds: [hall],
        tags: ['дом'],
        secrets: [{ id: 'sec-shelf', text: 'Нужная полка — третья слева от окна, на уровне плеча.', revealed: false }],
        events: [],
      }),
      normalizeLocation({
        id: greenhouse,
        name: 'Оранжерея',
        shortDescription: 'Тёплый воздух, разбитый горшок и земля на плитах.',
        gmDescription: 'Ключ сломан в замке изнутри. Ирма ночевала здесь и слышала, как кто-то вышел не через дверь, а через низкое окно в сад.',
        characterIds: [irma],
        linkedLocationIds: [hall],
        tags: ['сад'],
        secrets: [{ id: 'sec-window', text: 'Низкое окно открывается наружу и ведёт к калитке.', revealed: false }],
        events: [],
      }),
      normalizeLocation({
        id: cellar,
        name: 'Винный подвал',
        shortDescription: 'Сырой подвал, стойка с бутылками и узкая дверь без ручки.',
        gmDescription: 'Флакон с настойкой стоит среди вина. За стойкой ход в старый ледник. Клара ушла туда сама и оставила билет Леону как ложный след.',
        characterIds: [],
        linkedLocationIds: [hall],
        tags: ['тайна'],
        secrets: [{ id: 'sec-passage', text: 'Ход открывается, если выдвинуть третью бутылку слева.', revealed: false }],
        events: [{ id: 'ev-passage', title: 'Открыть ход', text: 'За ходом Клара жива и ждёт, пока Леон признается в долгах.', happened: false }],
      }),
    ]

    const characters = [
      normalizeCharacter({
        id: agatha,
        name: 'Агата Вереск',
        portraitId: agathaPortrait.id,
        age: '58',
        role: 'Хранительница дома',
        playerAttitude: 'warm',
        shortDescription: 'Старшая сестра отца Клары. Говорит тихо и не любит, когда в доме повышают голос.',
        personality: 'Сдержанная, точная, усталая. Защищает дом сильнее, чем людей.',
        appearance: 'Серое платье, ключи на поясе, влажные от дождя рукава.',
        biography: 'После смерти брата Агата осталась в особняке и фактически ведёт его. Клару растила она.',
        speech: 'Короткие фразы. Поправляет собеседника, если тот путает время.',
        motivation: 'Сохранить дом и не отдать его кредиторам Леона.',
        goals: 'Увести подозрение от Клары и заставить Леона признаться самому.',
        secrets: 'Знает, что Клара жива, но не скажет, пока партия не найдёт ход в подвале.',
        knows: 'Свет погас в десять. Леон вернулся мокрый. Ирма не выходила в холл.',
        hides: 'Сама отодвинула портрет и спрятала конверт.',
        canTell: 'Расписание дома и кто где спал. Про Клару — только то, что та «легла рано».',
        locationIds: [hall],
        clueIds: [soil, ticket],
        tags: ['семья'],
        dialogues: [
          { id: 'dlg-1', kind: 'normal', title: 'Где Клара', text: 'Клара легла рано. Я не поднималась к ней после десяти. В этом доме так принято.' },
          { id: 'dlg-2', kind: 'right_question', title: 'Когда погас свет', text: 'В десять, не позже. Я как раз закрывала ставни в холле. Леон в это время был уже в доме, хотя говорит иначе.' },
          { id: 'dlg-3', kind: 'present_clue', title: 'Земля на ковре', text: 'Ковёр принесли из оранжереи. Я не спрашивала зачем. Спросите Леона, почему земля только на его следе.' },
          { id: 'dlg-4', kind: 'high_trust', title: 'Если её не обвиняют', text: 'Я слышала дверь оранжереи после полуночи. Ирма не лжёт о окне. Клара боялась не дома, а долгов племянника.' },
          { id: 'dlg-5', kind: 'event', title: 'Ход найден', text: 'Раз вы открыли подвал, идите до конца. И не дайте Леону войти первым.' },
        ],
      }),
      normalizeCharacter({
        id: leon,
        name: 'Леон Вереск',
        portraitId: leonPortrait.id,
        age: '27',
        role: 'Племянник',
        playerAttitude: 'cold',
        shortDescription: 'Сын младшего брата. Обаятельный, когда ему нужно, и резкий, когда разговор про деньги.',
        personality: 'Быстрый ум, плохая совесть. Путает заботу и контроль.',
        appearance: 'Дорогое пальто, грязные манжеты, царапина на костяшке.',
        biography: 'Проиграл крупную сумму и надеялся, что Клара подпишет бумаги на дом.',
        speech: 'Говорит гладко, но повторяет одну и ту же подробность, если лжёт.',
        motivation: 'Не попасть под долг и не дать Кларе уехать.',
        goals: 'Убедить партию, что Клара уехала ночным поездом.',
        secrets: 'Сам купил билет на её имя и порвал его, когда она отказалась.',
        knows: 'Где Ирма прячет запасной ключ. Что в дневнике есть запись о его долге.',
        hides: 'Порванный билет он сунул за подкладку пальто, потом переложил в холл.',
        canTell: 'Опишет вечер до десяти довольно честно. После десяти начинает путать комнаты.',
        locationIds: [hall],
        clueIds: [ticket, diary],
        tags: ['семья'],
        dialogues: [
          { id: 'dlg-6', kind: 'normal', title: 'Где он был', text: 'Я вернулся к одиннадцати. До этого был в городе. Клара уже не спускалась, Агата вам подтвердит.' },
          { id: 'dlg-7', kind: 'right_question', title: 'Почему манжеты мокрые', text: 'Дождь. Я шёл от ворот. Не от оранжереи, если вы об этом.' },
          { id: 'dlg-8', kind: 'present_clue', title: 'Билет', text: 'Это не её почерк на билете. Я… купил его заранее. Она не поехала. Это всё, что я скажу при Агате.' },
          { id: 'dlg-9', kind: 'high_trust', title: 'Если долг назван вслух', text: 'Мне нужны были её подписи, не её отсутствие. Я испугался, когда она пропала. Ход в подвале я не открывал.' },
        ],
      }),
      normalizeCharacter({
        id: irma,
        name: 'Ирма Соль',
        portraitId: irmaPortrait.id,
        age: '34',
        role: 'Ботаник',
        playerAttitude: 'warm',
        shortDescription: 'Подруга Клары, живёт при оранжерее и знает дом лучше гостей.',
        personality: 'Прямая, наблюдательная, не любит Леона и не скрывает этого.',
        appearance: 'Рабочий фартук, земля под ногтями, спокойные руки.',
        biography: 'Приехала составлять гербарий семьи и осталась на зиму.',
        speech: 'Называет растения точнее, чем людей. На вопрос отвечает вопросом, если не доверяет.',
        motivation: 'Вытащить Клару из семьи, не разрушив ей путь назад.',
        goals: 'Добиться, чтобы партию пустили в подвал без Леона.',
        secrets: 'Помогла Кларе открыть ход и обещала молчать до утра.',
        knows: 'Окно оранжереи, сломанный ключ, что земля на ковре — с ботинок Леона.',
        hides: 'Записку Клары в гербарии, пока партия не покажет, что не работает на Леона.',
        canTell: 'Что слышала ночью и какие растения сдвинуты.',
        locationIds: [greenhouse],
        clueIds: [key, herb, soil],
        tags: ['дом'],
        dialogues: [
          { id: 'dlg-10', kind: 'normal', title: 'Ночь в оранжерее', text: 'Я не выходила в холл. Здесь теплее, и Клара просила не оставлять горшки на сквозняке.' },
          { id: 'dlg-11', kind: 'present_clue', title: 'Сломанный ключ', text: 'Ключ сломали снаружи, а дверь потом закрыли изнутри. Так делают, когда хотят, чтобы искали не там.' },
          { id: 'dlg-12', kind: 'high_trust', title: 'Если Леона нет рядом', text: 'Она ушла не на поезд. Посмотрите вино, которое никто не пьёт. Третья бутылка слева.' },
        ],
      }),
      normalizeCharacter({
        id: clara,
        name: 'Клара Вереск',
        portraitId: claraPortrait.id,
        age: '24',
        role: 'Наследница',
        playerAttitude: 'fond',
        shortDescription: 'Пропавшая хозяйка дома. Жива и прячется в леднике за подвалом.',
        personality: 'Мягкая речь и жёсткое решение. Больше не хочет быть печатью на чужих бумагах.',
        appearance: 'Тёмное платье, чернила на пальцах, шарф Ирмы.',
        biography: 'Ей оставили дом и долги, о которых она узнала слишком поздно.',
        speech: 'Говорит тихо, но не извиняется за то, что спряталась.',
        motivation: 'Исчезнуть на одну ночь, чтобы Леон остался с правдой наедине.',
        goals: 'Вернуться в дом только после того, как долг назван при свидетелях.',
        secrets: 'Уйти было её решением. Агата знала. Леон — нет.',
        knows: 'Где дневник, что билет поддельный след, как открыть ход.',
        hides: 'Пока сидит в темноте и слушает, не привёл ли Леон чужих людей.',
        canTell: 'Всю ночь, если партия пришла без Леона или он уже признался.',
        locationIds: [library, cellar],
        clueIds: [diary, letter, vial],
        tags: ['семья'],
        dialogues: [
          { id: 'dlg-13', kind: 'event', title: 'Партия открыла ход', text: 'Если вы от Леона, уходите. Если нет — сядьте. Я расскажу, какие бумаги он хотел, чтобы я подписала.' },
          { id: 'dlg-14', kind: 'normal', title: 'Пока её не нашли', text: 'Клары нет в этой сцене. Не озвучивайте её реплики заранее.' },
        ],
      }),
    ]

    const clues = [
      normalizeClue({
        id: letter,
        name: 'Письмо без подписи',
        type: 'document',
        description: 'Короткое письмо о ночном поезде, без обращения и без подписи.',
        discoveryLocationId: library,
        locationIds: [library],
        status: 'not_found',
        history: 'Клара начала письмо Леону и не стала его отправлять.',
        reveals: 'Она думала уехать, но передумала до того, как погас свет.',
        characterIds: [clara, leon],
        linkedClueIds: [diary, ticket],
        tags: ['документ'],
      }),
      normalizeClue({
        id: key,
        name: 'Сломанный ключ',
        type: 'item',
        description: 'Ключ от оранжереи, обломанный в замке.',
        discoveryLocationId: greenhouse,
        locationIds: [greenhouse],
        status: 'found',
        history: 'Запасной ключ Ирмы. Леон сломал его, когда пытался войти после Клары.',
        reveals: 'В оранжерею ломились снаружи уже после того, как дверь закрыли изнутри.',
        characterIds: [irma, leon],
        linkedClueIds: [soil],
        tags: ['предмет'],
      }),
      normalizeClue({
        id: soil,
        name: 'Земля на ковре',
        type: 'clue',
        description: 'Мокрые следы оранжерейной земли на ковре в холле.',
        discoveryLocationId: hall,
        locationIds: [hall, greenhouse],
        status: 'found',
        history: 'Ковёр чистили утром. Земля появилась ночью.',
        reveals: 'След совпадает с ботинками Леона, не Ирмы.',
        characterIds: [leon, irma, agatha],
        linkedClueIds: [key],
        tags: ['след'],
      }),
      normalizeClue({
        id: diary,
        name: 'Дневник Клары',
        type: 'document',
        description: 'Тонкая тетрадь с гербарием между страницами.',
        discoveryLocationId: library,
        locationIds: [library],
        status: 'found',
        history: 'Клара прятала тетрадь за книгами, а не в спальне.',
        reveals: 'Леон просил подписать дарственную на дом. Клара отказала вчера днём.',
        characterIds: [clara, leon],
        linkedClueIds: [letter],
        tags: ['документ'],
      }),
      normalizeClue({
        id: vial,
        name: 'Флакон с настойкой',
        type: 'item',
        description: 'Маленький флакон среди винных бутылок. Пахнет мятой, не ядом.',
        discoveryLocationId: cellar,
        locationIds: [cellar],
        status: 'not_found',
        history: 'Ирма готовила настойку от бессонницы для Клары.',
        reveals: 'Клара была в подвале и забрала с собой только шарф, флакон оставила как знак.',
        characterIds: [irma, clara],
        linkedClueIds: [herb],
        tags: ['предмет'],
      }),
      normalizeClue({
        id: ticket,
        name: 'Билет на ночной поезд',
        type: 'document',
        description: 'Порванный билет на имя Клары. Время отправления — после того, как погас свет.',
        discoveryLocationId: hall,
        locationIds: [hall],
        status: 'not_found',
        history: 'Леон купил билет утром и порвал ночью.',
        reveals: 'Клара не могла уехать этим поездом: билет никуда не предъявляли.',
        characterIds: [leon],
        linkedClueIds: [letter],
        tags: ['документ'],
      }),
      normalizeClue({
        id: herb,
        name: 'Записка в гербарии',
        type: 'document',
        description: 'Узкая полоска бумаги между листами мяты: «Не ищите меня в спальне».',
        discoveryLocationId: greenhouse,
        locationIds: [greenhouse],
        status: 'not_found',
        history: 'Ирма вложила записку после ухода Клары.',
        reveals: 'Ирма — союзница, а не подозреваемая, если партию не привёл Леон.',
        characterIds: [irma, clara],
        linkedClueIds: [vial],
        notes: 'Становится доступной, когда партию пустили в оранжерею без Леона.',
        tags: ['документ'],
      }),
    ]

    const players = [
      normalizePlayer({
        id: maria,
        playerName: 'Мария',
        characterName: 'Ада Кроу',
        portraitId: adaPortrait.id,
        classRole: 'Сыщица',
        age: '31',
        appearance: 'Короткое пальто, блокнот, внимательный взгляд.',
        personality: 'Задаёт один вопрос и ждёт, кто заполнит паузу.',
        biography: 'Её наняли найти Клару до того, как делом займётся город.',
        goals: 'Понять, жива ли Клара, и не отдать дом кредиторам.',
        motives: 'Не любит семейные тайны, в которых платит младший.',
        abilities: 'Замечает, когда человек повторяет одну и ту же подробность.',
        inventory: [{ id: 'inv-1', name: 'Блокнот', notes: 'Мария записывает время, не версии.' }],
        revealedInfo: [{ id: 'info-1', text: 'Мария решила, что Ада не сообщает полиции до конца вечера.', at: new Date().toISOString() }],
        notes: 'Игроку важно давать паузу после вопроса к Агате.',
      }),
      normalizePlayer({
        id: pavel,
        playerName: 'Павел',
        characterName: 'Тим Брук',
        portraitId: timPortrait.id,
        classRole: 'Журналист',
        age: '29',
        appearance: 'Потёртый шарф, фотоаппарат без вспышки.',
        personality: 'Обаятельный и слишком быстрый на выводы.',
        biography: 'Пишет о старых домах города и уже слышал про долги Леона.',
        goals: 'Получить историю, которую можно напечатать, не уничтожив Клару.',
        motives: 'Хочет доказать, что светская хроника врёт.',
        abilities: 'Может разговорить Леона, если не давить при Агате.',
        inventory: [{ id: 'inv-2', name: 'Фотоаппарат', notes: 'Без вспышки. В темноте почти бесполезен, но Леон этого не знает.' }],
        notes: 'Павел любит улики-документы. Билет отдавать ему.',
      }),
    ]

    const relations = [
      normalizeRelation({ id: 'rel-1', fromId: agatha, toId: leon, type: 'kinship', description: 'Тётка и племянник. Агата больше не покрывает его долги.', closeness: -1, visibility: 'public' }),
      normalizeRelation({ id: 'rel-2', fromId: agatha, toId: clara, type: 'kinship', description: 'Агата растила Клару и сейчас покрывает её уход.', closeness: 3, visibility: 'gm' }),
      normalizeRelation({ id: 'rel-3', fromId: leon, toId: clara, type: 'kinship', description: 'Двоюродные. Леон завидует, что дом оставили ей.', closeness: -3, visibility: 'gm' }),
      normalizeRelation({ id: 'rel-4', fromId: irma, toId: clara, type: 'trust', description: 'Ирма помогла Кларе спрятаться и хранит записку.', closeness: 4, visibility: 'gm' }),
      normalizeRelation({ id: 'rel-5', fromId: leon, toId: irma, type: 'distrust', description: 'Леон считает, что Ирма научила Клару отказу. Он пытался использовать её ключ, чтобы перехватить Клару.', closeness: -2, visibility: 'public' }),
    ]

    const sessions = [
      normalizeSession({
        id: 'session-1',
        number: 1,
        date: daysAgo(1),
        title: 'Свет погас в десять',
        description: 'Партия вошла в дом с улицы, осмотрела холл и оранжерею. Агата держалась версии про ранний сон. Леон дважды повторил, что вернулся к одиннадцати.',
        events: [
          { id: 'sev-1', text: 'Нашли сломанный ключ и землю на ковре.' },
          { id: 'sev-2', text: 'Ирма не пустила Леона в разговор про окно.' },
        ],
        decisions: [{ id: 'sd-1', text: 'До утра не звать инспектора.' }],
        foundClueIds: [key, soil],
        notes: 'В следующей сессии начать в библиотеке.',
      }),
    ]

    const notes = [
      normalizeNote({
        id: 'note-1',
        title: 'Не выдавать дневник сразу',
        text: 'Дневник лежит за полкой у окна. Отдавать, только если спросят про книги, а не про стол.',
        locationIds: [library],
        characterIds: [clara],
        clueIds: [diary],
        tags: ['ведение'],
      }),
      normalizeNote({
        id: 'note-2',
        title: 'Леон лжёт о билете',
        text: 'Если показывают билет при Агате, Леон защищается. Наедине может признать покупку, но не порчу.',
        characterIds: [leon, agatha],
        clueIds: [ticket],
        tags: ['ведение'],
      }),
    ]

    for (const row of locations) await db.put('locations', row, { touch: false })
    for (const row of characters) await db.put('characters', row, { touch: false })
    for (const row of clues) await db.put('clues', row, { touch: false })
    for (const row of players) await db.put('players', row, { touch: false })
    for (const row of relations) await db.put('relations', row, { touch: false })
    for (const row of sessions) await db.put('sessions', row, { touch: false })
    for (const row of notes) await db.put('notes', row, { touch: false })
    await db.saveProgress({
      id: 'main',
      beats: [
        { id: 'beat-1', title: 'Осмотреть холл', done: true, note: '' },
        { id: 'beat-2', title: 'Поговорить с Агатой наедине', done: false, note: '' },
        { id: 'beat-3', title: 'Показать Ирме землю с ковра', done: false, note: '' },
        { id: 'beat-4', title: 'Открыть ход в подвале', done: false, note: '' },
      ],
    })
    await db.syncRegistryCover()
  } finally {
    if (db.isOpen()) db.close()
  }
  return getCampaignRecord(created.id)
}

function svgImage(label, color, square = true) {
  const safe = String(label).replace(/[&<>]/g, '')
  const width = square ? 640 : 480
  const height = 640
  const fontSize = square ? 120 : (safe.length > 12 ? 36 : 56)
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${color}"/>
  <rect x="28" y="28" width="${width - 56}" height="${height - 56}" fill="none" stroke="#e6d7bf" stroke-width="2"/>
  <text x="${width / 2}" y="340" fill="#f6f1e7" font-family="Georgia, serif" font-size="${fontSize}" text-anchor="middle">${safe}</text>
</svg>`
  return {
    data: new TextEncoder().encode(svg).buffer,
    mime: 'image/svg+xml',
    name: `${safe}.svg`,
  }
}

function daysAgo(days) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
