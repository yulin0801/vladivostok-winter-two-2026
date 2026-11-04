import type { RecordType } from './types';
export const seedRecords: { id: string; type: RecordType; data: Record<string, unknown> }[] = [
  {id:'trip-settings',type:'settings',data:{startDate:'2026-12-05',endDate:'2026-12-09',outbound:'13:00–18:05',inbound:'19:05–19:55',timezone:'Asia/Vladivostok',flightNote:'航班时刻按机票各机场当地时间记录，出发机场与航班号待补充。'}},
  {id:'p-station',type:'place',data:{name:'海参崴火车站',ruName:'Железнодорожный вокзал Владивостока',lat:43.111339,lng:131.882138,category:'景点',day:'2026-12-06',order:0,time:'10:00',duration:45,note:'建议行程，可调整。西伯利亚铁路的终点。营业与参观安排出发前确认。',visited:false,sourceUrl:'https://www.tutu.ru/poezda/station/map/2034130/'}},
  {id:'p-submarine',type:'place',data:{name:'C-56 潜艇博物馆',ruName:'Подводная лодка С-56',lat:43.113382,lng:131.891254,category:'景点',day:'2026-12-06',order:1,time:'11:00',duration:60,note:'建议行程，可调整。参观开放时间与门票待确认。',visited:false,sourceUrl:'https://zaschitnikiotechestva.ru/istoriya-i-kultura/museum/gvardejskaya-krasnoznamennaya-podvodnaya-lodka-s-56'}},
  {id:'p-arch',type:'place',data:{name:'皇太子凯旋门',ruName:'Арка цесаревича',lat:43.114064,lng:131.892944,category:'景点',day:'2026-12-06',order:2,time:'12:15',duration:30,note:'建议行程，可调整。与潜艇博物馆可放在同一天。',visited:false,sourceUrl:'https://visit-primorye.ru/news/zagadaem-zhelanie'}},
  {id:'p-fokina',type:'place',data:{name:'福金上将街',ruName:'Улица Адмирала Фокина',lat:43.117681,lng:131.880876,category:'景点',day:'2026-12-06',order:3,time:'14:00',duration:60,note:'建议行程，可调整。位置标在 4A 号附近，沿街散步、找咖啡馆。',visited:false,sourceUrl:'https://yandex.by/maps/75/vladivostok/house/ulitsa_admirala_fokina_4a/ZUoHaA9oSU0AWkJuYGJwcHtlbAk%3D/'}},
  {id:'p-promenade',type:'place',data:{name:'运动港海滨步道',ruName:'Спортивная набережная',lat:43.119405,lng:131.876847,category:'景点',day:'2026-12-06',order:4,time:'15:15',duration:60,note:'建议行程，可调整。海边散步看海，按天气缩短户外停留。',visited:false,sourceUrl:'https://openarium.ru/poi/11120169/'}},
  {id:'p-lighthouse',type:'place',data:{name:'托卡列夫灯塔',ruName:'Маяк Токаревского',lat:43.073169,lng:131.843148,category:'景点',day:'2026-12-07',order:0,time:'10:30',duration:90,note:'候选行程。驾车导航可能只到道路末端；接近灯塔的路段需现场确认潮位、结冰与通行条件。',visited:false,sourceUrl:'https://www.kinoprim.ru/index.php/node/2567'}},
  {id:'p-eagle',type:'place',data:{name:'鹰巢山',ruName:'Сопка Орлиное Гнездо',lat:43.121322,lng:131.896750,category:'景点',day:'2026-12-07',order:1,time:'14:00',duration:60,note:'候选行程。坐标为山体定位点，具体观景入口与交通需确认。',visited:false,sourceUrl:'https://www.herbariumle.ru/?id=2024&t=toponyms'}},
  {id:'p-aquarium',type:'place',data:{name:'滨海海洋馆',ruName:'Приморский океанариум',lat:43.014116,lng:131.930113,category:'景点',day:'2026-12-08',order:0,time:'10:00',duration:180,note:'候选行程。位于俄罗斯岛；出发前核实当日开放、票务和交通。',visited:false,sourceUrl:'https://yandex.com/maps/11409/primorsky-krai/house/ulitsa_akademika_kasyanova_25/ZUoHaA5jSUQGX0JuYGJxcHhiZQ4%3D/'}},
  ...[
    ['sim','购买并确认可在俄罗斯使用的流量卡 / eSIM','出发前'],
    ['flight','补充航班号、出发机场与托运行李额度','交通'],
    ['hotel','确定酒店并保存俄文地址、入住信息','住宿'],
    ['docs','核对护照、签证 / 入境条件和保险','出发前'],
    ['booking','确认海洋馆与博物馆开放时间、预约方式','行程'],
    ['money','确认可用付款方式与现金安排','出发前'],
    ['airport','确认机场接送；12 月 9 日返程为 19:05 起飞，按航司要求倒推到机场时间','交通']
  ].map(([id,text,category])=>({id:'n-'+id,type:'note' as RecordType,data:{text,category,done:false}})),
  ...['崔天琴','张渝琳'].flatMap((owner,i)=>[
    ['护照与出行证件','证件'],['保暖外套','衣物'],['手套、围巾、帽子','衣物'],['防滑保暖鞋','衣物'],['手机充电器与充电宝','电子'],['个人常用药','日用']
  ].map(([text,category],j)=>({id:`pack-${i}-${j}`,type:'packing' as RecordType,data:{text,category,owner,done:false}})))
];
