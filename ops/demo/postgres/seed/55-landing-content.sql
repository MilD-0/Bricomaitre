-- Curated campaign copy. This also publishes a new revision when applied to an
-- existing demo, so previously saved revisions remain recoverable.
CREATE TEMP TABLE demo_campaign_copy (product_key text PRIMARY KEY, fr jsonb, ar jsonb);
INSERT INTO demo_campaign_copy VALUES
('abo:B07XCVXGPG',
$copy${
  "title":"Coffret de forets et embouts UMI, 55 pièces",
  "summary":"55 accessoires de perçage et de vissage réunis dans un coffret de rangement pour les petits travaux et l’entretien de la maison.",
  "heading":"Percez, vissez, rangez. Tout reste ensemble.",
  "benefits":[
    {"title":"Deux tâches, un coffret","description":"Passez du perçage au vissage en choisissant l’accessoire adapté, sans multiplier les boîtes ouvertes sur l’établi.","icon":"tool"},
    {"title":"Plusieurs matériaux","description":"La sélection comprend des forets destinés au bois, au métal et à la maçonnerie. Choisissez le foret prévu pour votre support.","icon":"layers"},
    {"title":"Un rangement dédié","description":"Retrouvez vos accessoires dans leur coffret après chaque intervention et préparez plus facilement la suivante.","icon":"check"}
  ],
  "feature":{"heading":"Le petit matériel qui accompagne vos projets","body":"Une étagère à poser, un meuble à monter, une fixation à reprendre : ces travaux demandent souvent de changer d’accessoire en cours de route. Le coffret UMI rassemble 55 pièces pour couvrir le perçage et le vissage courants, avec notamment des mèches plates pour le bois et des embouts de vissage.","bullets":["Forets pour différents supports","Embouts pour les travaux de vissage","Coffret de rangement inclus"]},
  "uses":[
    {"title":"Monter et ajuster","description":"Préparez les avant-trous dans le bois puis passez à un embout correspondant à l’empreinte de la vis.","icon":"tool"},
    {"title":"Installer une fixation","description":"Sélectionnez le foret selon le matériau et le diamètre demandé par la cheville ou la fixation.","icon":"target"},
    {"title":"Entretenir la maison","description":"Gardez les accessoires de vos interventions courantes regroupés et transportables.","icon":"layers"}
  ],
  "specs":[{"label":"Marque","value":"UMI"},{"label":"Composition","value":"55 pièces"},{"label":"Fonctions","value":"Perçage et vissage"},{"label":"Supports annoncés","value":"Bois, métal et maçonnerie, selon le foret"},{"label":"Rangement","value":"Coffret inclus"}],
  "faq":[
    {"question":"Une perceuse est-elle fournie ?","answer":"Non. Il s’agit d’un coffret de forets et d’embouts à utiliser avec votre outil compatible."},
    {"question":"Puis-je utiliser le même foret sur tous les matériaux ?","answer":"Non. Choisissez le type et le diamètre de foret adaptés au support, puis vérifiez la compatibilité avec le mandrin de votre outil."},
    {"question":"Le coffret convient-il aux petits travaux domestiques ?","answer":"Il est prévu pour les travaux de perçage et de vissage courants. Pour une opération particulière, vérifiez que le diamètre et le profil nécessaires figurent dans le coffret."}
  ],
  "closing":"Préparez votre prochain petit chantier."
}$copy$::jsonb,
$copy${
  "title":"طقم ريش ورؤوس UMI، 55 قطعة",
  "summary":"55 قطعة للحفر والربط في علبة واحدة، لأعمال التركيب والصيانة المنزلية مع إبقاء اللوازم مرتبة.",
  "heading":"احفر واربط، ثم أعد كل قطعة إلى مكانها.",
  "benefits":[
    {"title":"الحفر والربط معاً","description":"انتقل من الريشة إلى رأس الربط المناسب دون توزيع اللوازم بين عدة علب على طاولة العمل.","icon":"tool"},
    {"title":"لعدة أنواع من الأسطح","description":"تضم المجموعة ريشاً مخصصة للخشب والمعدن والبناء. اختر الريشة الملائمة للمادة التي تعمل عليها.","icon":"layers"},
    {"title":"علبة للتنظيم","description":"أعد اللوازم إلى علبتها بعد كل عمل لتجدها مجتمعة عند الحاجة التالية.","icon":"check"}
  ],
  "feature":{"heading":"لوازم صغيرة ترافق مشاريعك اليومية","body":"تركيب رف أو تجميع قطعة أثاث أو إصلاح تثبيت يتطلب غالباً تغيير اللوازم أثناء العمل. يجمع طقم UMI خمساً وخمسين قطعة للحفر والربط، بينها ريش مسطحة للخشب ورؤوس للبراغي.","bullets":["ريش لأسطح مختلفة","رؤوس لأعمال الربط","علبة تنظيم ضمن الطقم"]},
  "uses":[
    {"title":"التجميع والضبط","description":"حضّر الثقوب الأولية في الخشب ثم اختر رأساً مطابقاً لشكل البرغي.","icon":"tool"},
    {"title":"تجهيز نقاط التثبيت","description":"اختر الريشة حسب مادة السطح والقطر المطلوب للسدادة أو وسيلة التثبيت.","icon":"target"},
    {"title":"الصيانة المنزلية","description":"احتفظ بلوازم التدخلات المعتادة مجتمعة في علبة يسهل نقلها.","icon":"layers"}
  ],
  "specs":[{"label":"العلامة","value":"UMI"},{"label":"عدد القطع","value":"55 قطعة"},{"label":"الاستخدام","value":"الحفر والربط"},{"label":"الأسطح المعلنة","value":"الخشب والمعدن والبناء، حسب الريشة"},{"label":"التنظيم","value":"علبة ضمن الطقم"}],
  "faq":[
    {"question":"هل توجد آلة حفر ضمن الطقم؟","answer":"لا. يحتوي الطقم على ريش ورؤوس تُستخدم مع أداة متوافقة لديك."},
    {"question":"هل تصلح الريشة نفسها لكل المواد؟","answer":"لا. اختر نوع الريشة وقطرها حسب السطح، وتحقق من ملاءمتها لظرف الأداة."},
    {"question":"هل يناسب الأعمال المنزلية الصغيرة؟","answer":"الطقم مخصص للحفر والربط المعتادين. إذا كان لديك عمل محدد، تحقق من وجود القطر ونوع الرأس المطلوبين ضمن المجموعة."}
  ],
  "closing":"جهّز لوازم مشروعك القادم."
}$copy$::jsonb),
('abo:B081RKD96X',
$copy${
  "title":"Mètre ruban UMI, 8 m",
  "summary":"Un mètre rétractable de 8 mètres avec clip de ceinture métallique, pour prendre vos cotes à l’atelier et sur chantier.",
  "heading":"Prenez la cote avant de passer à l’action.",
  "benefits":[
    {"title":"Une longueur de 8 mètres","description":"Disposez de la longueur de ruban nécessaire pour de nombreuses mesures de pièces, de panneaux et d’aménagements.","icon":"target"},
    {"title":"À portée de main","description":"Le clip métallique permet de porter le mètre à la ceinture entre deux prises de cote.","icon":"tool"},
    {"title":"Un ruban rétractable","description":"Rangez le ruban dans son boîtier après la mesure et gardez votre espace de travail dégagé.","icon":"check"}
  ],
  "feature":{"heading":"Une mesure claire, puis un repère","body":"Pour préparer une découpe ou vérifier un emplacement, commencez par une cote fiable. Ce mètre UMI de 8 m accompagne les relevés du quotidien. Maintenez le ruban bien aligné avec la dimension à mesurer, puis reportez votre repère avant de couper ou de fixer.","bullets":["Longueur de ruban : 8 m","Clip de ceinture en métal","Ruban rétractable dans son boîtier"]},
  "uses":[
    {"title":"Préparer une découpe","description":"Relevez la longueur utile sur une planche ou un panneau et reportez-la avant la coupe.","icon":"target"},
    {"title":"Vérifier un emplacement","description":"Contrôlez les dimensions disponibles avant de choisir un meuble ou de placer une étagère.","icon":"layers"},
    {"title":"Faire un relevé","description":"Notez les dimensions successives d’un espace pour préparer votre liste de matériaux.","icon":"tool"}
  ],
  "specs":[{"label":"Marque","value":"UMI"},{"label":"Type","value":"Mètre ruban rétractable"},{"label":"Longueur","value":"8 m"},{"label":"Portage","value":"Clip de ceinture métallique"},{"label":"Certification annoncée","value":"MID"}],
  "faq":[
    {"question":"Les 8 mètres correspondent-ils à la longueur du ruban ?","answer":"Oui. Il s’agit de la longueur totale annoncée du ruban, et non d’une portée sans soutien."},
    {"question":"Le mètre remplace-t-il un niveau ?","answer":"Non. Le mètre mesure une distance ; un niveau sert à contrôler l’horizontalité ou la verticalité."},
    {"question":"Comment garder une mesure régulière ?","answer":"Alignez le ruban, évitez de le laisser former une courbe et contrôlez votre point de départ avant de reporter la cote."}
  ],
  "closing":"Gardez vos prochaines mesures à portée de main."
}$copy$::jsonb,
$copy${
  "title":"شريط قياس UMI بطول 8 أمتار",
  "summary":"شريط قياس قابل للسحب بطول 8 أمتار، مع مشبك حزام معدني لقياسات الورشة وموقع العمل.",
  "heading":"خذ القياس أولاً، ثم ابدأ العمل.",
  "benefits":[
    {"title":"طول 8 أمتار","description":"طول عملي لكثير من قياسات الغرف والألواح وأعمال التجهيز.","icon":"target"},
    {"title":"قريب من يدك","description":"يتيح المشبك المعدني حمل المتر على الحزام بين قياس وآخر.","icon":"tool"},
    {"title":"شريط قابل للسحب","description":"أعد الشريط إلى علبته بعد القياس لتبقى مساحة العمل مرتبة.","icon":"check"}
  ],
  "feature":{"heading":"قياس واضح قبل وضع العلامة","body":"قبل القص أو التثبيت، ابدأ بقياس مضبوط. يرافقك متر UMI بطول 8 أمتار في القياسات اليومية. حافظ على استقامة الشريط بمحاذاة البعد المطلوب، ثم انقل العلامة إلى موضع العمل.","bullets":["طول الشريط: 8 أمتار","مشبك حزام معدني","شريط يُسحب إلى داخل العلبة"]},
  "uses":[
    {"title":"التحضير للقص","description":"خذ الطول المطلوب على لوح خشبي ثم ضع العلامة قبل القطع.","icon":"target"},
    {"title":"فحص المساحة المتاحة","description":"تحقق من الأبعاد قبل اختيار قطعة أثاث أو تحديد موضع رف.","icon":"layers"},
    {"title":"تسجيل الأبعاد","description":"دوّن قياسات المكان لتجهيز قائمة المواد المطلوبة.","icon":"tool"}
  ],
  "specs":[{"label":"العلامة","value":"UMI"},{"label":"النوع","value":"شريط قياس قابل للسحب"},{"label":"الطول","value":"8 أمتار"},{"label":"الحمل","value":"مشبك حزام معدني"},{"label":"الشهادة المعلنة","value":"MID"}],
  "faq":[
    {"question":"هل 8 أمتار هي طول الشريط؟","answer":"نعم، هذا هو الطول الإجمالي المعلن للشريط، وليس طول امتداده دون دعم."},
    {"question":"هل يغني المتر عن ميزان التسوية؟","answer":"لا. المتر يقيس المسافة، بينما يُستخدم ميزان التسوية لفحص الاستواء الأفقي أو العمودي."},
    {"question":"كيف أحافظ على دقة القياس؟","answer":"حافظ على استقامة الشريط دون انحناء، وتحقق من نقطة البداية قبل نقل القياس."}
  ],
  "closing":"اجعل قياساتك القادمة أسهل."
}$copy$::jsonb),
('abo:B000NDOEMY',
$copy${
  "title":"Jeu de tournevis Denali, 52 pièces",
  "summary":"Un jeu de 52 pièces avec poignées à prise souple, pour regrouper les outils de vissage manuel de l’atelier.",
  "heading":"Le bon profil pour chaque assemblage.",
  "benefits":[
    {"title":"52 pièces réunies","description":"Élargissez votre sélection pour choisir une taille et une empreinte adaptées à la vis rencontrée.","icon":"layers"},
    {"title":"Prise souple","description":"Les poignées Cushion Grip accompagnent les gestes de vissage manuel et de réglage.","icon":"tool"},
    {"title":"Un geste contrôlé","description":"Le vissage manuel permet de sentir la résistance de l’assemblage et d’ajuster progressivement le serrage.","icon":"target"}
  ],
  "feature":{"heading":"Du montage au dernier réglage","body":"Les mêmes vis ne se retrouvent pas partout. Un meuble, un panneau d’accès ou un petit équipement peuvent demander des profils différents. Ce jeu Denali rassemble 52 pièces pour constituer une réserve d’outils de vissage manuel à l’atelier.","bullets":["Jeu de 52 pièces","Poignées Cushion Grip","Sélection du profil et de la taille selon la vis"]},
  "uses":[
    {"title":"Assembler un meuble","description":"Présentez le bon embout dans l’empreinte et accompagnez le serrage sans forcer sur la tête de vis.","icon":"tool"},
    {"title":"Ajuster un mécanisme","description":"Procédez par petites corrections lorsque l’assemblage demande un réglage progressif.","icon":"target"},
    {"title":"Entretenir un équipement","description":"Gardez plusieurs outils disponibles pour les fixations rencontrées lors de l’entretien courant.","icon":"layers"}
  ],
  "specs":[{"label":"Marque","value":"Denali"},{"label":"Nombre de pièces","value":"52"},{"label":"Utilisation","value":"Vissage manuel"},{"label":"Poignées","value":"Cushion Grip, prise souple"}],
  "faq":[
    {"question":"Comment choisir le tournevis ?","answer":"Choisissez une empreinte et une taille qui remplissent correctement la tête de vis. Un outil trop petit risque de glisser et de l’endommager."},
    {"question":"Les poignées sont-elles isolées pour travailler sous tension ?","answer":"Aucune certification d’isolation électrique n’est annoncée pour ce jeu. Ne le considérez pas comme un outillage isolé."},
    {"question":"Le jeu remplace-t-il une visseuse électrique ?","answer":"Il est destiné au vissage manuel. Il est utile pour les réglages et assemblages où vous souhaitez contrôler le serrage à la main."}
  ],
  "closing":"Complétez votre poste de vissage."
}$copy$::jsonb,
$copy${
  "title":"طقم مفكات Denali، 52 قطعة",
  "summary":"طقم من 52 قطعة بمقابض ذات قبضة لينة، لتجميع أدوات الربط اليدوي اللازمة في الورشة.",
  "heading":"اختر الرأس المناسب لكل تركيب.",
  "benefits":[
    {"title":"52 قطعة معاً","description":"خيارات متعددة لاختيار المقاس والشكل المناسبين للبرغي الذي تعمل عليه.","icon":"layers"},
    {"title":"قبضة لينة","description":"مقابض Cushion Grip ترافق حركات الربط والضبط اليدوي.","icon":"tool"},
    {"title":"تحكم تدريجي","description":"يساعد الربط اليدوي على الإحساس بمقاومة القطعة وضبط الشد تدريجياً.","icon":"target"}
  ],
  "feature":{"heading":"من التجميع إلى آخر ضبط","body":"تختلف البراغي بين الأثاث وأغطية الوصول والمعدات الصغيرة. يجمع هذا الطقم من Denali اثنتين وخمسين قطعة لتوفير مجموعة من أدوات الربط اليدوي في الورشة.","bullets":["طقم من 52 قطعة","مقابض Cushion Grip","اختيار المقاس وشكل الرأس حسب البرغي"]},
  "uses":[
    {"title":"تركيب الأثاث","description":"اختر الرأس المطابق للبرغي ثم اربط دون إتلاف موضع الإمساك.","icon":"tool"},
    {"title":"ضبط الآليات","description":"أجرِ تعديلات صغيرة عندما يحتاج التجميع إلى ضبط تدريجي.","icon":"target"},
    {"title":"صيانة المعدات","description":"احتفظ بأدوات متنوعة للتعامل مع مثبتات الصيانة المعتادة.","icon":"layers"}
  ],
  "specs":[{"label":"العلامة","value":"Denali"},{"label":"عدد القطع","value":"52"},{"label":"الاستخدام","value":"الربط اليدوي"},{"label":"المقابض","value":"Cushion Grip بقبضة لينة"}],
  "faq":[
    {"question":"كيف أختار المفك؟","answer":"اختر رأساً يطابق شكل البرغي ويملأه جيداً. قد ينزلق الرأس الصغير ويتلف البرغي."},
    {"question":"هل المقابض عازلة للعمل على الكهرباء؟","answer":"لا توجد شهادة عزل كهربائي معلنة لهذا الطقم، لذلك لا تعتبره مجموعة أدوات معزولة."},
    {"question":"هل يغني عن المفك الكهربائي؟","answer":"الطقم مخصص للربط اليدوي، خاصة عند الضبط أو التجميع الذي يحتاج إلى التحكم في الشد باليد."}
  ],
  "closing":"أكمل أدوات الربط في ورشتك."
}$copy$::jsonb),
('abo:B000NLWQ8A',
$copy${
  "title":"Visseuse à chocs Denali 18 V, outil seul",
  "summary":"La Denali 565117 associe une gâchette à vitesse variable et un frein. Outil vendu sans batterie : vérifiez votre équipement compatible avant de commander.",
  "heading":"Gardez la main sur vos fixations répétées.",
  "benefits":[
    {"title":"Vitesse variable","description":"Dosez la vitesse à la gâchette pour accompagner le départ de la vis et la progression du vissage.","icon":"target"},
    {"title":"Fonction frein","description":"Le frein complète la commande de vitesse pour les séquences de vissage successives.","icon":"check"},
    {"title":"Format sans fil","description":"Un outil 18 V conçu pour fonctionner avec une batterie Denali compatible, vendue séparément.","icon":"power"}
  ],
  "feature":{"heading":"Un outil seul, pour un équipement déjà compatible","body":"Cette référence est la visseuse à chocs Denali 565117 en version sans batterie. Elle s’adresse à un atelier qui peut vérifier la disponibilité de l’alimentation et des accessoires correspondants. La tension de 18 V ne suffit pas à établir la compatibilité entre deux systèmes de batteries.","bullets":["Modèle Denali 565117","Gâchette à vitesse variable avec frein","Batterie non incluse : compatibilité à vérifier"]},
  "uses":[
    {"title":"Répéter un assemblage","description":"Préparez les fixations et un embout adapté au travail à chocs avant de commencer la série.","icon":"layers"},
    {"title":"Installer une structure","description":"Accompagnez les fixations avec une vitesse adaptée au matériau et au diamètre de la vis.","icon":"tool"},
    {"title":"Compléter l’atelier","description":"Ajoutez l’outil à un équipement Denali compatible après contrôle de la batterie nécessaire.","icon":"power"}
  ],
  "specs":[{"label":"Marque","value":"Denali"},{"label":"Référence","value":"565117"},{"label":"Tension annoncée","value":"18 V"},{"label":"Commande","value":"Gâchette à vitesse variable"},{"label":"Frein","value":"Oui"},{"label":"Version","value":"Outil seul, sans batterie"}],
  "faq":[
    {"question":"La batterie est-elle incluse ?","answer":"Non. Cette référence est vendue sans batterie. Vérifiez que vous disposez de la batterie et du moyen de charge compatibles avant de commander."},
    {"question":"Toute batterie 18 V convient-elle ?","answer":"Non. La tension seule ne garantit pas la compatibilité. Il faut vérifier le système de connexion et la référence de batterie prévue pour cet outil."},
    {"question":"Peut-elle remplacer une perceuse ?","answer":"Il s’agit d’une visseuse à chocs destinée au vissage. Pour le perçage, choisissez un outil et un foret prévus pour le matériau à travailler."}
  ],
  "closing":"Vérifiez votre batterie, puis complétez votre équipement."
}$copy$::jsonb,
$copy${
  "title":"مفك صدمات Denali بجهد 18 فولت، دون بطارية",
  "summary":"يجمع Denali 565117 بين زناد متغير السرعة وفرامل. الأداة دون بطارية؛ تحقق من تجهيزاتك المتوافقة قبل الطلب.",
  "heading":"تحكم في أعمال الربط المتكررة.",
  "benefits":[
    {"title":"سرعة متغيرة","description":"اضبط السرعة بالزناد عند بدء الربط وأثناء تقدم البرغي.","icon":"target"},
    {"title":"فرامل","description":"تكمّل الفرامل التحكم في السرعة خلال عمليات الربط المتتالية.","icon":"check"},
    {"title":"عمل دون سلك","description":"أداة بجهد 18 فولت مصممة لبطارية Denali متوافقة تُباع منفصلة.","icon":"power"}
  ],
  "feature":{"heading":"أداة منفردة لتجهيز متوافق لديك","body":"هذه النسخة من مفك الصدمات Denali 565117 لا تتضمن بطارية. تحقق من توفر مصدر الطاقة واللوازم المناسبة لها قبل الشراء. وجود الجهد نفسه، 18 فولت، لا يعني توافق نظامي بطاريات مختلفين.","bullets":["الموديل Denali 565117","زناد متغير السرعة مع فرامل","البطارية غير مرفقة؛ يلزم التحقق من التوافق"]},
  "uses":[
    {"title":"تكرار التجميع","description":"جهّز المثبتات ورأساً مناسباً لأعمال الصدمات قبل بدء سلسلة الربط.","icon":"layers"},
    {"title":"تركيب الهياكل","description":"استخدم سرعة مناسبة للمادة وقطر البرغي أثناء التثبيت.","icon":"tool"},
    {"title":"إكمال تجهيز الورشة","description":"أضف الأداة إلى تجهيز Denali متوافق بعد التأكد من البطارية المطلوبة.","icon":"power"}
  ],
  "specs":[{"label":"العلامة","value":"Denali"},{"label":"المرجع","value":"565117"},{"label":"الجهد المعلن","value":"18 فولت"},{"label":"التحكم","value":"زناد متغير السرعة"},{"label":"الفرامل","value":"نعم"},{"label":"النسخة","value":"الأداة فقط، دون بطارية"}],
  "faq":[
    {"question":"هل البطارية ضمن الطلب؟","answer":"لا. تُباع هذه النسخة دون بطارية. تحقق من توفر البطارية ووسيلة الشحن المتوافقتين قبل الطلب."},
    {"question":"هل تناسبها كل بطارية بجهد 18 فولت؟","answer":"لا. الجهد وحده لا يضمن التوافق؛ يجب التحقق من نظام التوصيل ومرجع البطارية المخصص للأداة."},
    {"question":"هل يحل محل المثقاب؟","answer":"هذه أداة صدمات مخصصة للربط. للحفر، اختر أداة وريشة مخصصتين للمادة التي تعمل عليها."}
  ],
  "closing":"تحقق من بطاريتك، ثم أكمل تجهيزك."
}$copy$::jsonb),
('abo:B000NLYRIM',
$copy${
  "title":"Scie sabre Denali 18 V, outil seul",
  "summary":"Une scie sabre sans fil Denali 565046 pour les coupes de reprise, à utiliser avec une lame et une batterie compatibles. Batterie non incluse.",
  "heading":"Préparez vos coupes de reprise.",
  "benefits":[
    {"title":"Coupe alternative","description":"Le mouvement de va-et-vient de la lame distingue cette scie sabre d’une scie circulaire.","icon":"tool"},
    {"title":"Alimentation 18 V","description":"Travaillez sans cordon avec le système de batterie compatible avec cette référence Denali.","icon":"power"},
    {"title":"Choix de la lame","description":"Adaptez la lame au matériau et à l’épaisseur à couper, puis vérifiez son montage sur la scie.","icon":"target"}
  ],
  "feature":{"heading":"La bonne lame pour le travail prévu","body":"La Denali 565046 est une scie sabre, proposée ici en version outil seul. Le choix de la lame détermine l’usage possible sur votre matériau. Préparez un appui stable, dégagez la zone de coupe et contrôlez les accessoires ainsi que l’alimentation avant utilisation.","bullets":["Modèle Denali 565046","Scie sabre sans fil 18 V","Batterie non incluse"]},
  "uses":[
    {"title":"Préparer une reprise","description":"Repérez la coupe et vérifiez l’absence d’éléments cachés dans la zone à travailler.","icon":"target"},
    {"title":"Adapter le consommable","description":"Sélectionnez une lame compatible avec le matériau et la coupe prévue.","icon":"layers"},
    {"title":"Compléter un équipement","description":"Vérifiez votre batterie Denali et vos accessoires avant d’ajouter cet outil seul à l’atelier.","icon":"tool"}
  ],
  "specs":[{"label":"Marque","value":"Denali"},{"label":"Référence","value":"565046"},{"label":"Type","value":"Scie sabre, mouvement alternatif"},{"label":"Tension annoncée","value":"18 V"},{"label":"Version","value":"Outil seul, sans batterie"}],
  "faq":[
    {"question":"Est-ce une scie circulaire ?","answer":"Non. C’est une scie sabre : sa lame travaille par mouvement alternatif, et non avec un disque circulaire."},
    {"question":"La batterie est-elle fournie ?","answer":"Non. Cette référence est proposée sans batterie. Vérifiez l’alimentation et le moyen de charge compatibles avant de commander."},
    {"question":"Une même lame convient-elle à tous les matériaux ?","answer":"Non. La lame doit correspondre au matériau, à l’épaisseur et au montage de l’outil. Consultez les indications de la lame et de la scie."}
  ],
  "closing":"Choisissez l’outil avec ses accessoires compatibles."
}$copy$::jsonb,
$copy${
  "title":"منشار ترددي Denali بجهد 18 فولت، دون بطارية",
  "summary":"منشار ترددي لاسلكي Denali 565046 لأعمال القطع، مع ضرورة اختيار شفرة وبطارية متوافقتين. البطارية غير مرفقة.",
  "heading":"جهّز أعمال القطع والتعديل.",
  "benefits":[
    {"title":"حركة ترددية","description":"تتحرك الشفرة ذهاباً وإياباً، وهذا ما يميز المنشار الترددي عن المنشار الدائري.","icon":"tool"},
    {"title":"جهد 18 فولت","description":"اعمل دون سلك مع نظام البطارية المتوافق مع مرجع Denali هذا.","icon":"power"},
    {"title":"اختيار الشفرة","description":"اختر الشفرة حسب المادة والسماكة ثم تحقق من ملاءمة تركيبها على المنشار.","icon":"target"}
  ],
  "feature":{"heading":"الشفرة المناسبة للعمل المطلوب","body":"Denali 565046 منشار ترددي يُعرض هنا كأداة دون بطارية. تحدد الشفرة المختارة نوع العمل الممكن على المادة. جهّز تثبيتاً مستقراً، وأخلِ منطقة القطع، وتحقق من اللوازم ومصدر الطاقة قبل الاستخدام.","bullets":["الموديل Denali 565046","منشار ترددي لاسلكي بجهد 18 فولت","البطارية غير مرفقة"]},
  "uses":[
    {"title":"التحضير للتعديل","description":"حدّد خط القطع وتحقق من خلو المنطقة من عناصر مخفية.","icon":"target"},
    {"title":"اختيار اللوازم","description":"اختر شفرة متوافقة مع المادة ونوع القطع المطلوب.","icon":"layers"},
    {"title":"إكمال التجهيز","description":"تحقق من بطارية Denali واللوازم قبل إضافة الأداة إلى الورشة.","icon":"tool"}
  ],
  "specs":[{"label":"العلامة","value":"Denali"},{"label":"المرجع","value":"565046"},{"label":"النوع","value":"منشار ترددي"},{"label":"الجهد المعلن","value":"18 فولت"},{"label":"النسخة","value":"الأداة فقط، دون بطارية"}],
  "faq":[
    {"question":"هل هو منشار دائري؟","answer":"لا. هذا منشار ترددي تتحرك شفرته ذهاباً وإياباً، ولا يستخدم قرصاً دائرياً."},
    {"question":"هل البطارية مرفقة؟","answer":"لا. تُعرض هذه النسخة دون بطارية. تحقق من مصدر الطاقة ووسيلة الشحن المتوافقين قبل الطلب."},
    {"question":"هل تصلح شفرة واحدة لكل المواد؟","answer":"لا. يجب أن تناسب الشفرة المادة والسماكة وطريقة التركيب. راجع تعليمات الشفرة والمنشار."}
  ],
  "closing":"اختر الأداة مع لوازمها المتوافقة."
}$copy$::jsonb),
('abo:B000VDI8UK',
$copy${
  "title":"Duo de lampes torches LED Denali",
  "summary":"Deux lampes torches LED à corps en aluminium, aux formats 2 AA et 3 D, pour l’inspection et l’éclairage à la main.",
  "heading":"Éclairez le détail qui vous échappe.",
  "benefits":[
    {"title":"Deux formats","description":"Le lot associe une torche au format 2 AA et une torche au format 3 D pour organiser votre équipement.","icon":"layers"},
    {"title":"Éclairage LED","description":"Dirigez la lumière vers la pièce ou la zone que vous devez examiner.","icon":"target"},
    {"title":"Corps en aluminium","description":"Deux torches à prendre en main pour accompagner les contrôles et les petites interventions.","icon":"tool"}
  ],
  "feature":{"heading":"Une lumière d’inspection à déplacer avec vous","body":"Un raccord sous un meuble, un recoin de rangement ou le fond d’un compartiment : certaines zones demandent un éclairage dirigé. Ce duo Denali réunit deux lampes torches LED en aluminium. Choisissez le format à emporter selon la place disponible et préparez les piles correspondantes.","bullets":["Lot de deux lampes torches LED","Formats de piles : 2 AA et 3 D","Corps en aluminium"]},
  "uses":[
    {"title":"Inspecter un recoin","description":"Orientez le faisceau vers la zone à observer lors d’un contrôle visuel.","icon":"target"},
    {"title":"Préparer une intervention","description":"Gardez une torche dans votre équipement pour éclairer les pièces difficiles à voir.","icon":"tool"},
    {"title":"Organiser deux emplacements","description":"Répartissez les deux formats entre l’atelier et votre rangement de matériel.","icon":"layers"}
  ],
  "specs":[{"label":"Marque","value":"Denali"},{"label":"Contenu","value":"Deux lampes torches"},{"label":"Éclairage","value":"LED"},{"label":"Corps","value":"Aluminium"},{"label":"Formats de piles","value":"2 AA et 3 D"}],
  "faq":[
    {"question":"Est-ce un projecteur de chantier ?","answer":"Non. Il s’agit d’un lot de deux lampes torches à main, et non d’un projecteur fixe ou sur trépied."},
    {"question":"Quels formats de piles faut-il prévoir ?","answer":"Une lampe utilise le format 2 AA et l’autre le format 3 D. La présence des piles dans le conditionnement n’est pas précisée ; faites-la confirmer avec votre commande."},
    {"question":"Quelle autonomie est annoncée ?","answer":"Aucune durée d’autonomie vérifiée n’est disponible pour cette référence. Elle dépend notamment des piles utilisées et des conditions d’emploi."}
  ],
  "closing":"Gardez un éclairage d’appoint dans votre équipement."
}$copy$::jsonb,
$copy${
  "title":"طقم مصباحين يدويين LED من Denali",
  "summary":"مصباحان يدويان بتقنية LED وجسم من الألومنيوم، بصيغتي 2 AA و3 D للفحص والإضاءة الموجهة باليد.",
  "heading":"أنر التفاصيل التي يصعب رؤيتها.",
  "benefits":[
    {"title":"حجمان في طقم واحد","description":"يضم الطقم مصباحاً يعمل بصيغة 2 AA وآخر بصيغة 3 D لتنظيم تجهيزاتك.","icon":"layers"},
    {"title":"إضاءة LED","description":"وجّه الضوء نحو القطعة أو المنطقة التي تريد فحصها.","icon":"target"},
    {"title":"جسم من الألومنيوم","description":"مصباحان للحمل باليد خلال الفحص والتدخلات الصغيرة.","icon":"tool"}
  ],
  "feature":{"heading":"ضوء للفحص يتحرك معك","body":"وصلة تحت قطعة أثاث أو زاوية تخزين أو داخل حجرة صغيرة: تحتاج بعض الأماكن إلى ضوء موجّه. يجمع هذا الطقم من Denali مصباحين يدويين LED بجسم من الألومنيوم. اختر الحجم الذي يناسب المساحة وجهّز البطاريات المطلوبة.","bullets":["طقم من مصباحين يدويين LED","صيغتا البطاريات: 2 AA و3 D","جسم من الألومنيوم"]},
  "uses":[
    {"title":"فحص الزوايا","description":"وجّه الشعاع إلى المنطقة المراد معاينتها بصرياً.","icon":"target"},
    {"title":"تجهيز التدخلات","description":"احتفظ بمصباح ضمن أدواتك لإنارة القطع التي يصعب رؤيتها.","icon":"tool"},
    {"title":"توزيع التجهيزات","description":"وزّع المصباحين بين الورشة ومكان حفظ الأدوات.","icon":"layers"}
  ],
  "specs":[{"label":"العلامة","value":"Denali"},{"label":"المحتوى","value":"مصباحان يدويان"},{"label":"الإضاءة","value":"LED"},{"label":"الجسم","value":"ألومنيوم"},{"label":"صيغتا البطاريات","value":"2 AA و3 D"}],
  "faq":[
    {"question":"هل هو كشاف لموقع العمل؟","answer":"لا. هذا طقم من مصباحين للحمل باليد، وليس كشافاً ثابتاً أو مثبتاً على حامل."},
    {"question":"ما البطاريات التي أحتاج إليها؟","answer":"يعمل أحد المصباحين بصيغة 2 AA والآخر بصيغة 3 D. لم يُذكر إن كانت البطاريات ضمن العبوة؛ اطلب تأكيد ذلك مع الطلب."},
    {"question":"ما مدة التشغيل المعلنة؟","answer":"لا تتوفر مدة تشغيل موثقة لهذا المرجع. تتأثر المدة بنوع البطاريات وظروف الاستخدام."}
  ],
  "closing":"أضف إضاءة محمولة إلى تجهيزاتك."
}$copy$::jsonb);

UPDATE products product SET
  title = copy.fr->>'title', title_ar = copy.ar->>'title',
  description = copy.fr->>'summary', description_ar = copy.ar->>'summary', updated_at = now()
FROM demo_campaign_copy copy WHERE product.mongo_id = copy.product_key;

UPDATE demo_runtime.landing_page_products campaign SET
  title_fr = copy.fr->>'title', title_ar = copy.ar->>'title',
  description_fr = copy.fr->>'summary', description_ar = copy.ar->>'summary'
FROM demo_campaign_copy copy WHERE campaign.product_key = copy.product_key;

WITH localized AS (
  SELECT page.*, product.images, CASE WHEN page.locale = 'ar' THEN copy.ar ELSE copy.fr END AS copy,
    page.locale = 'ar' AS ar,
    coalesce((SELECT max(revision) FROM landing_page_revisions WHERE landing_page_id = page.id), 0) + 1 AS next_revision
  FROM landing_pages page
  JOIN products product ON product.id = page.product_id
  JOIN demo_campaign_copy copy ON copy.product_key = product.mongo_id
), revisions AS (
  INSERT INTO landing_page_revisions (landing_page_id, revision, schema_version, document, source, created_by)
  SELECT id, next_revision, 2, jsonb_build_object(
    'schemaVersion', 2,
    'theme', jsonb_build_object('accent', 'teal', 'density', 'comfortable', 'shell', 'campaign'),
    'seo', jsonb_build_object('title', left(copy->>'title', 70), 'description', left(copy->>'summary', 170), 'indexable', false),
    'blocks', jsonb_build_array(
      jsonb_build_object('id','hero','type','product-hero','variant','media-right','surface','white',
        'heading',copy->>'heading','subheading',copy->>'summary','imageUrl',images[1],
        'imageAlt',copy->>'title','primaryCtaLabel',CASE WHEN ar THEN 'اطلب الآن' ELSE 'Commander' END,'showAddToCart',true),
      jsonb_build_object('id','benefits','type','benefit-grid','variant','icons',
        'heading',CASE WHEN ar THEN 'ما الذي يقدمه لك؟' ELSE 'Ce qu’il vous apporte' END,'items',copy->'benefits'),
      jsonb_build_object('id','details','type','media-feature','variant','media-left','surface','soft',
        'heading',copy->'feature'->>'heading','body',copy->'feature'->>'body','bullets',copy->'feature'->'bullets',
        'imageUrl',images[2],'imageAlt',copy->>'title'),
      jsonb_build_object('id','uses','type','use-cases','variant','editorial',
        'heading',CASE WHEN ar THEN 'في أعمالك اليومية' ELSE 'Dans vos travaux du quotidien' END,'items',copy->'uses'),
      jsonb_build_object('id','specifications','type','specifications','variant','table','width','narrow',
        'heading',CASE WHEN ar THEN 'المواصفات الأساسية' ELSE 'Les caractéristiques à connaître' END,'items',copy->'specs'),
      jsonb_build_object('id','gallery','type','image-gallery','variant','filmstrip',
        'heading',CASE WHEN ar THEN 'تعرّف على المنتج' ELSE 'Le produit de plus près' END,
        'images',jsonb_build_array(
          jsonb_build_object('imageUrl',images[3],'imageAlt',copy->>'title'),
          jsonb_build_object('imageUrl',images[4],'imageAlt',copy->>'title'))),
      jsonb_build_object('id','faq','type','faq','variant','accordion','width','narrow',
        'heading',CASE WHEN ar THEN 'قبل الطلب' ELSE 'Avant de commander' END,'items',copy->'faq'),
      jsonb_build_object('id','order-steps','type','process','variant','horizontal','surface','soft',
        'heading',CASE WHEN ar THEN 'من الطلب إلى الاستلام' ELSE 'De la commande à la réception' END,
        'steps',jsonb_build_array(
          jsonb_build_object('title',CASE WHEN ar THEN 'أدخل بياناتك' ELSE 'Renseignez vos coordonnées' END,
            'description',CASE WHEN ar THEN 'اختر الكمية وأدخل رقم هاتفك ووجهة التوصيل.' ELSE 'Choisissez la quantité et indiquez votre téléphone et votre destination.' END),
          jsonb_build_object('title',CASE WHEN ar THEN 'أكّد هاتفياً' ELSE 'Confirmez par téléphone' END,
            'description',CASE WHEN ar THEN 'نتصل بك للتحقق من المرجع والتوفر وشروط التوصيل قبل الإرسال.' ELSE 'Nous vérifions avec vous la référence, la disponibilité et les conditions de livraison avant l’envoi.' END),
          jsonb_build_object('title',CASE WHEN ar THEN 'ادفع عند الاستلام' ELSE 'Payez à la livraison' END,
            'description',CASE WHEN ar THEN 'يتم الدفع نقداً عند استلام الطلب وفق التفاصيل التي تم تأكيدها.' ELSE 'Le règlement s’effectue en espèces à la réception, selon les détails confirmés ensemble.' END))),
      jsonb_build_object('id','final','type','final-cta','variant','split','surface','dark',
        'heading',copy->>'closing','body',copy->>'title','imageUrl',images[1],'imageAlt',copy->>'title',
        'primaryCtaLabel',CASE WHEN ar THEN 'اطلب الآن' ELSE 'Commander maintenant' END)
    )
  ), 'admin', 'operator@demo.bricomaitre.invalid'
  FROM localized
  RETURNING landing_page_id, revision
)
UPDATE landing_pages page SET draft_revision = revisions.revision,
  published_revision = CASE WHEN page.status = 'published' THEN revisions.revision ELSE page.published_revision END,
  updated_by = 'operator@demo.bricomaitre.invalid', updated_at = now()
FROM revisions WHERE page.id = revisions.landing_page_id;

DROP TABLE demo_campaign_copy;
