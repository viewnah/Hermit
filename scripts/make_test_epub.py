#!/usr/bin/env python3
"""Generate a test Chinese EPUB 3 book for clip-reader."""
import io
import os
import zipfile

from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), '..', '三国演义·青梅煮酒.epub')

chapters = [
    ("第一回　宴桃园豪杰三结义　斩黄巾英雄首立功",
     """话说天下大势，分久必合，合久必分。周末七国分争，并入于秦。及秦灭之后，楚、汉分争，又并入于汉。汉朝自高祖斩白蛇而起义，一统天下，后来光武中兴，传至献帝，遂分为三国。

推其致乱之由，殆始于桓、灵二帝。桓帝禁锢善类，崇信宦官。及桓帝崩，灵帝即位，大将军窦武、太傅陈蕃，共相辅佐。时有宦官曹节等弄权，窦武、陈蕃谋诛之，机事不密，反为所害，中涓自此愈横。

建宁二年四月望日，帝御温德殿。方升座，殿角狂风骤起，只见一条大青蛇，从梁上飞将下来，蟠于椅上。帝惊倒，左右急救入宫，百官俱奔避。须臾，蛇不见了。忽然大雷大雨，加以冰雹，落到半夜方止，坏却房屋无数。

建宁四年二月，洛阳地震；又海水泛溢，沿海居民，尽被大浪卷入海中。光和元年，雌鸡化雄。六月朔，黑气十余丈，飞入温德殿中。秋七月，有虹见于玉堂；五原山岸，尽皆崩裂。种种不祥，非止一端。

帝下诏问群臣以灾异之由，议郎蔡邕上疏，以为蜺堕鸡化，乃妇寺干政之所致，言颇切直。帝览奏叹息，因起更衣。曹节在后窃视，悉宣告左右；遂以他事陷邕于罪，放归田里。后张让、赵忠、封谞、段珪、曹节、侯览、蹇硕、程旷、夏恽、郭胜十人朋比为奸，号为“十常侍”。帝尊信张让，呼为“阿父”。朝政日非，以致天下人心思乱，盗贼蜂起。

且说那张角兄弟三人，一名张宝，一名张梁。张角是个不第秀才，因入山采药，遇一老人，碧眼童颜，手持藜杖，唤角至一洞中，以天书三卷授之，曰：“此名《太平要术》，汝得之，当代天宣化，普救世人。若萌异心，必获恶报。”角拜问姓名。老人曰：“吾乃南华老仙也。”言讫，化阵清风而去。

角得此书，晓夜攻习，能呼风唤雨，号为“太平道人”。中平元年正月内，疫气流行，张角散施符水，为人治病，自称“大贤良师”。角有徒弟五百余人，云游四方，皆能书符念咒。次后徒众日多，角乃立三十六方，大方万余人，小方六七千，各立渠帅，称为将军。

讹言：“苍天已死，黄天当立；岁在甲子，天下大吉。”令人各以白土，书“甲子”二字于家中大门上。青、幽、徐、冀、荆、扬、兖、豫八州之人，家家侍奉大贤良师张角名字。角遣其党马元义，暗赍金帛，结交中涓封谞，以为内应。角与二弟商议曰：“至难得者，民心也。今民心已顺，若不乘势取天下，诚为可惜。”遂一面私造黄旗，约期举事；一面使弟子唐周，驰书报封谞。唐周乃径赴省中告变。帝召大将军何进调兵擒马元义，斩之；次收封谞等一干人下狱。

张角闻知事露，星夜举兵，自称“天公将军”，张宝称“地公将军”，张梁称“人公将军”。申言于众曰：“今汉运将终，大圣人出。汝等皆宜顺天从正，以乐太平。”四方百姓，裹黄巾从张角反者四五十万。贼势浩大，官军望风而靡。何进奏帝火速降诏，令各处备御，讨贼立功；一面遣中郎将卢植、皇甫嵩、朱儁，各引精兵、分三路讨之。"""),
    ("第二回　张翼德怒鞭督邮　何国舅谋诛宦竖",
     """且说董卓字仲颖，陇西临洮人也，官拜河东太守，自来骄傲。当日怠慢了玄德，张飞性发，便欲杀之。玄德与关公急止之曰：“他是朝廷命官，岂可擅杀？”飞曰：“若不杀这厮，反要在他部下听令，其实不甘！二兄要便住在此，我自投别处去也！”玄德曰：“我三人义同生死，岂可相离？不若都投别处去便了。”飞曰：“若如此，稍解吾恨。”

于是三人连夜引军来投朱儁。儁待之甚厚，合兵一处，进讨张宝。是时曹操自跟皇甫嵩讨张梁，大战于曲阳。这里朱儁进攻张宝。张宝引贼众八九万，屯于后山下。玄德为先锋，与贼对阵。张宝遣副将高升出马搦战，玄德使张飞击之。飞纵马挺矛，与升交战，不数合，刺升落马。玄德麾军直冲过去。张宝就马上披发仗剑，作起妖法。只见风雷大作，一股黑气，从天而降，黑气中似有无限人马杀来。玄德连忙回军，军中大乱。败阵而归，与朱儁计议。

儁曰：“彼用妖术，我来日可宰猪羊狗血，令军士伏于山头；候贼赶来，从高坡上泼之，其法可解。”玄德听令，拨关公、张飞各引军一千，伏于山后高冈之上，盛猪羊狗血并秽物准备。次日，张宝摇旗擂鼓，引军搦战，玄德出迎。交锋之际，张宝作法，风雷大作，飞砂走石，黑气漫天，滚滚人马，自天而下。玄德拨马便走，张宝驱兵赶来。将过山头，关、张伏军放起号炮，秽物齐泼。但见空中纸人草马，纷纷坠地；风雷顿息，砂石不飞。

张宝见解了法，急欲退军。左关公、右张飞，两军都出，背后玄德、朱儁一齐赶上，贼兵大败。玄德望见“地公将军”旗号，飞马赶来，张宝落荒而走。玄德发箭，中其左臂。张宝带箭逃脱，走入阳城，坚守不出。朱儁引兵围住阳城攻打，一面差人打探皇甫嵩消息。

时又黄巾余党三人——赵弘、韩忠、孙仲，聚众数万，望风烧劫，称与张角报仇。朝廷命朱儁即以得胜之师讨之。儁奉诏，率军前进。时贼据宛城，儁引兵攻之，赵弘遣韩忠出战。儁遣玄德、关、张攻城西南角。韩忠尽率精锐之众，来西南角抵敌。朱儁自纵铁骑二千，径取东北角。贼恐失城，急弃西南而回。玄德从背后掩杀，贼众大败，奔入宛城。朱儁分兵四面围定。城中断粮，韩忠使人出城投降。儁不许。玄德曰：“昔高祖之得天下，盖为能招降纳顺；公何拒韩忠耶？”儁曰：“彼一时，此一时也。昔秦、项之际，天下大乱，民无定主，故招降赏附，以劝来耳。今海内一统，惟黄巾造反；若容其降，无以劝善。使贼得利恣意劫掠，失利便投降：此长寇之志，无益也。”玄德曰：“不容寇降是矣。今四面围如铁桶，贼乞降不得，必然死战。万人一心，尚不可当，况城中有数万死命之人乎？不若撤去东南，独攻西北。贼必弃城而走，无心恋战，可即擒也。”儁然之，随撤东南二面军马，一齐攻打西北。韩忠果然引军弃城而奔。儁与玄德、关、张率三军掩杀，射死韩忠，余皆四散奔走。正追赶间，赵弘、孙仲引贼众到，与儁交战。儁见弘势大，引军暂退。弘乘势复夺宛城。

儁离十里下寨。方欲攻打，忽见正东一彪军马到来。为首一将，生得广额阔面，虎体熊腰；吴郡富春人也，姓孙，名坚，字文台，乃孙武子之后。年十七岁时，与父至钱塘，见海贼十余人，劫取商人财物，于岸上分赃。坚谓父曰：“此贼可擒也。”遂奋力提刀上岸，扬声大叫，东西指挥，如唤人状。贼以为官兵至，尽弃财物奔走。坚赶上，杀一贼。由是郡县知名，荐为校尉。后会稽妖贼许昌造反，自称“阳明皇帝”，聚众数万；坚与郡司马招募勇士千余人，会合州郡破之，斩许昌并其子许韶。刺史臧旻上表奏其功，除坚为盐渎丞，又除盱眙丞、下邳丞。今见黄巾寇起，聚集乡中少年及诸商旅，并淮泗精兵一千五百余人，前来接应。

朱儁大喜，便令坚攻打南门，玄德打北门，朱儁打西门，留东门与贼走。孙坚首先登城，斩贼二十余人，贼众奔溃。赵弘飞马突槊，直取孙坚。坚从城上飞身夺弘槊，刺弘下马；却骑弘马，飞身往来杀贼。孙仲引贼突出北门，正迎玄德，无心恋战，只待奔逃。玄德张弓一箭，正中孙仲，翻身落马。朱儁大军随后掩杀，斩首数万级，降者不可胜计。南阳一路，十数郡皆平。

儁班师回京，诏封为车骑将军，河南尹。儁表奏孙坚、刘备等功。坚有人情，除别郡司马上任去了。惟玄德听候日久，不得除授。"""),
    ("第三回　议温明董卓叱丁原　馈金珠李肃说吕布",
     """且说前将军、鳌乡侯、西凉刺史董卓，先将表章申奏朝廷，其略曰：“窃闻天下所以乱逆不止者，皆由黄门常侍张让等侮慢天常之故。臣闻扬汤止沸，不如去薪；溃痈虽痛，胜于养毒。臣敢鸣钟鼓入洛阳，请除让等。社稷幸甚！”

何进得表，出示大臣。侍御史郑泰谏曰：“董卓乃豺狼也，引入京城，必食人矣。”进曰：“汝多疑，不足谋大事。”卢植亦谏曰：“植素知董卓为人，面善心狠；一入禁庭，必生祸患。不如止之勿来，免致生乱。”进不听，郑泰、卢植皆弃官而去。朝廷大臣，去者大半。进使人迎董卓于渑池，卓按兵不动。

张让等知外兵到，共议曰：“此何进之谋也；我等不先下手，皆灭族矣。”乃先伏刀斧手五十人于长乐宫嘉德门内，入告何太后曰：“今大将军矫诏召外兵至京师，欲灭臣等，望娘娘垂怜赐救。”太后曰：“汝等可诣大将军府谢罪。”让曰：“若到相府，骨肉齑粉矣。望娘娘宣大将军入宫谕止之。如其不从，臣等只就娘娘前请死。”太后乃降诏宣进。

进得诏便行。主簿陈琳谏曰：“太后此诏，必是十常侍之谋，切不可去。去必有祸。”进曰：“太后诏我，有何祸事？”袁绍曰：“今谋已泄，事已露，将军尚欲入宫耶？”曹操曰：“先召十常侍出，然后可入。”进笑曰：“此小儿之见也。吾掌天下之权，十常侍敢待如何？”绍曰：“公必欲去，我等引甲士护从，以防不测。”于是袁绍、曹操各选精兵五百，命袁绍之弟袁术带领。袁术全身披挂，引兵布列青琐门外。绍与操带剑护送何进至长乐宫前。黄门传懿旨云：“太后特宣大将军，余人不许辄入。”将袁绍、曹操等都阻住宫门外。

何进昂然直入。至嘉德殿门，张让、段珪迎出，左右围住，进大惊。让厉声责进曰：“董后何罪，妄以鸩死？国母丧葬，托疾不出！汝本屠沽小辈，我等荐之天子，以致荣贵；不思报效，欲相谋害！汝言我等甚浊，其清者是谁？”进慌急，欲寻出路，宫门尽闭，伏甲齐出，将何进砍为两段。

后人有诗叹之曰：“汉室倾危天数终，无谋何进作三公。几番不听忠臣谏，难免宫中受剑锋。”

让等既杀何进，袁绍久不见进出，乃于宫门外大叫曰：“请将军上车！”中黄门从墙上掷出何进头来。绍厉声大叫：“阉宦谋杀大臣！诛恶党者前来助战！”何进部将吴匡，便于青琐门外放起火来。袁术引兵突入宫庭，但见阉官，不论大小，尽皆杀之。袁绍、曹操斩关入内。赵忠、程旷、夏恽、郭胜四个被赶至翠花楼前，剁为肉泥。宫中火焰冲天。张让、段珪、曹节、侯览将太后及太子并陈留王劫去。内外人民，拥入宫中，掳掠宫人。"""),
]

CSS = """body { font-family: serif; }
h1 { text-align: center; margin: 2em 0; font-size: 1.3em; }
p { text-indent: 2em; margin: 0.6em 0; }"""


def esc(s: str) -> str:
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def build():
    out = os.path.abspath(OUT)
    if os.path.exists(out):
        os.remove(out)
    with zipfile.ZipFile(out, 'w') as z:
        z.writestr('mimetype', 'application/epub+zip', compress_type=zipfile.ZIP_STORED)
        z.writestr('META-INF/container.xml', '''<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>''')

        img = Image.new('RGB', (600, 852), (246, 241, 229))
        d = ImageDraw.Draw(img)
        d.rectangle([24, 24, 575, 827], outline=(179, 66, 58), width=6)
        try:
            font_big = ImageFont.truetype('/System/Library/Fonts/Supplemental/Songti.ttc', 84)
            font_small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Songti.ttc', 30)
        except OSError:
            font_big = font_small = ImageFont.load_default()
        d.text((300, 330), '三國演義', fill=(43, 38, 32), font=font_big, anchor='mm')
        d.text((300, 450), '青梅煮酒論英雄', fill=(111, 102, 90), font=font_small, anchor='mm')
        d.rectangle([240, 520, 360, 530], fill=(179, 66, 58))
        buf = io.BytesIO()
        img.save(buf, 'PNG')
        z.writestr('OEBPS/cover.png', buf.getvalue())

        z.writestr('OEBPS/style.css', CSS)
        z.writestr('OEBPS/cover.xhtml', '''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>封面</title></head>
<body><div style="text-align:center"><img src="cover.png" alt="封面" style="max-width:100%"/></div></body>
</html>''')

        manifest_items = [
            '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
            '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
            '<item id="css" href="style.css" media-type="text/css"/>',
            '<item id="cover-img" href="cover.png" media-type="image/png" properties="cover-image"/>',
            '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>',
        ]
        spine = ['<itemref idref="cover"/>']
        nav_lis, ncx_points = [], []

        for i, (title, text) in enumerate(chapters, 1):
            fname = f'chapter{i}.xhtml'
            manifest_items.append(f'<item id="ch{i}" href="{fname}" media-type="application/xhtml+xml"/>')
            spine.append(f'<itemref idref="ch{i}"/>')
            nav_lis.append(f'<li><a href="{fname}">{esc(title)}</a></li>')
            ncx_points.append(f'<navPoint id="np{i}" playOrder="{i}"><navLabel><text>{esc(title)}</text></navLabel><content src="{fname}"/></navPoint>')
            paras = '\n'.join(f'<p>{esc(p)}</p>' for p in text.split('\n') if p.strip())
            z.writestr(f'OEBPS/{fname}', f'''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>{esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<section epub:type="chapter">
<h1>{esc(title)}</h1>
{paras}
</section>
</body>
</html>''')

        z.writestr('OEBPS/nav.xhtml', f'''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>目录</title></head>
<body>
<nav epub:type="toc" id="toc">
<h1>目录</h1>
<ol>{''.join(nav_lis)}</ol>
</nav>
</body>
</html>''')

        z.writestr('OEBPS/toc.ncx', f'''<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="urn:uuid:sanguo-test-0001"/></head>
<docTitle><text>三国演义·青梅煮酒</text></docTitle>
<navMap>{''.join(ncx_points)}</navMap>
</ncx>''')

        z.writestr('OEBPS/content.opf', f'''<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:sanguo-test-0001</dc:identifier>
    <dc:title>三国演义·青梅煮酒</dc:title>
    <dc:creator id="author">罗贯中</dc:creator>
    <dc:language>zh-CN</dc:language>
    <dc:publisher>夹页测试社</dc:publisher>
    <meta property="dcterms:modified">2026-08-19T00:00:00Z</meta>
    <meta name="cover" content="cover-img"/>
  </metadata>
  <manifest>{''.join(manifest_items)}</manifest>
  <spine toc="ncx">{''.join(spine)}</spine>
</package>''')
    print('written:', out, os.path.getsize(out), 'bytes')


if __name__ == '__main__':
    build()
