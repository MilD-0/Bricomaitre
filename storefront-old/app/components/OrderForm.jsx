"use client";
import axios from "axios";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, useContext } from "react";
import { CartContext } from "./cartContext";
import { v4 as uuidv4 } from "uuid";
import { getCookie,setCookie } from "cookies-next";
import SimBrand from "./SimBrand";
import Brand from "./Brand";
import { handlePurchase, enrichPastEvents, getOrCreateExternalId } from "./Init";
import { getVisitIdFromCookie, getOrCreateJourneyId, getOrCreateSessionId } from "@/lib/analytics";
import {
  findDeliveryFee,
  findWilayaByName,
  getCommunesForWilaya,
} from "@/lib/storefront-api";


const communesData = {
  1: [
    "Adrar",
    "Akabli",
    "Aoulef",
    "Bouda",
    "Fenoughil",
    "In Zghmir",
    "Ouled Ahmed Timmi",
    "Reggane",
    "Sali",
    "Sebaa",
    "Tamantit",
    "Tamest",
    "Timekten",
    "Tit",
    "Tsabit",
    "Zaouiet Kounta",
  ],
  2: [
    "Abou El Hassan",
    "Ain Merane",
    "Benairia",
    "Beni Bouattab",
    "Beni Haoua",
    "Beni Rached",
    "Boukadir",
    "Bouzeghaia",
    "Breira",
    "Chettia",
    "Chlef",
    "Dahra",
    "El Hadjadj",
    "El Karimia",
    "El Marsa",
    "Harchoun",
    "Herenfa",
    "Labiod Medjadja",
    "Moussadek",
    "Oued Fodda",
    "Oued Goussine",
    "Oued Sly",
    "Ouled Abbes",
    "Ouled Ben Abdelkader",
    "Ouled Fares",
    "Oum Drou",
    "Sendjas",
    "Sidi Abderrahmane",
    "Sidi Akkacha",
    "Sobha",
    "Tadjena",
    "Talassa",
    "Taougrite",
    "Tenes",
    "Zeboudja",
  ],
  3: [
    "Aflou",
    "Ain Mahdi",
    "Ain Sidi Ali",
    "Beidha",
    "Benacer Benchohra",
    "Brida",
    "El Assafia",
    "El Ghicha",
    "El Haouaita",
    "Gueltat Sidi Saad",
    "Hadj Mechri",
    "Hassi Delaa",
    "Hassi R'mel",
    "Kheneg",
    "Ksar El Hirane",
    "Laghouat",
    "Oued M'zi",
    "Oued Morra",
    "Sebgag",
    "Sidi Bouzid",
    "Sidi Makhlouf",
    "Tadjemout",
    "Tadjrouna",
    "Taouiala",
  ],
  4: [
    "Ain Babouche",
    "Ain Beida",
    "Ain Diss",
    "Ain Fekroune",
    "Ain Kercha",
    "Ain M'lila",
    "Ain Zitoun",
    "Behir Chergui",
    "Berriche",
    "Bir Chouhada",
    "Dhala",
    "El Amiria",
    "El Belala",
    "El Djazia",
    "El Fedjoudj Boughrara Sa",
    "El Harmilia",
    "Fkirina",
    "Hanchir Toumghani",
    "Ksar Sbahi",
    "Meskiana",
    "Oued Nini",
    "Ouled Gacem",
    "Ouled Hamla",
    "Ouled Zouai",
    "Oum El Bouaghi",
    "Rahia",
    "Sigus",
    "Souk Naamane",
    "Zorg",
  ],
  5: [
    "Ain Djasser",
    "Ain Touta",
    "Ain Yagout",
    "Arris",
    "Azil Abedelkader",
    "Barika",
    "Batna",
    "Beni Foudhala El Hakania",
    "Bitam",
    "Boulhilat",
    "Boumagueur",
    "Boumia",
    "Bouzina",
    "Chemora",
    "Chir",
    "Djerma",
    "Djezzar",
    "El Hassi",
    "El Madher",
    "Fesdis",
    "Foum Toub",
    "Ghassira",
    "Gosbat",
    "Guigba",
    "Hidoussa",
    "Ichmoul",
    "Inoughissen",
    "Kimmel",
    "Ksar Bellezma",
    "Larbaa",
    "Lazrou",
    "Lemsane",
    "M Doukal",
    "Maafa",
    "Menaa",
    "Merouana",
    "N Gaous",
    "Oued Chaaba",
    "Oued El Ma",
    "Oued Taga",
    "Ouled Ammar",
    "Ouled Aouf",
    "Ouled Fadel",
    "Ouled Sellem",
    "Ouled Si Slimane",
    "Ouyoun El Assafir",
    "Rahbat",
    "Ras El Aioun",
    "Sefiane",
    "Seggana",
    "Seriana",
    "T Kout",
    "Talkhamt",
    "Taxlent",
    "Tazoult",
    "Teniet El Abed",
    "Tighanimine",
    "Tigharghar",
    "Tilatou",
    "Timgad",
    "Zanet El Beida",
  ],
  6: [
    "Adekar",
    "Ait R'zine",
    "Ait Smail",
    "Akbou",
    "Akfadou",
    "Amalou",
    "Amizour",
    "Aokas",
    "Barbacha",
    "Bejaia",
    "Beni Dejllil",
    "Beni K'sila",
    "Beni Mallikeche",
    "Benimaouche",
    "Boudjellil",
    "Bouhamza",
    "Boukhelifa",
    "Chellata",
    "Chemini",
    "Darghina",
    "Dra El Caid",
    "El Kseur",
    "Fenaia Il Maten",
    "Feraoun",
    "Ighil Ali",
    "Ighram",
    "Kendira",
    "Kherrata",
    "Leflaye",
    "M'cisna",
    "Melbou",
    "Oued Ghir",
    "Ouzellaguene",
    "Seddouk",
    "Sidi Aich",
    "Sidi Ayad",
    "Smaoun",
    "Souk El Tenine",
    "Souk Oufella",
    "Tala Hamza",
    "Tamokra",
    "Tamridjet",
    "Taourit Ighil",
    "Taskriout",
    "Tazmalt",
    "Tibane",
    "Tichy",
    "Tifra",
    "Timezrit",
    "Tinebdar",
    "Tizi N'berber",
    "Toudja",
  ],
  7: [
    "Ain Naga",
    "Ain Zaatout",
    "Biskra",
    "Bordj Ben Azzouz",
    "Bouchagroun",
    "Branis",
    "Chetma",
    "Djemorah",
    "El Feidh",
    "El Ghrous",
    "El Hadjab",
    "El Haouch",
    "El Kantara",
    "El Outaya",
    "Foughala",
    "Khenguet Sidi Nadji",
    "Lichana",
    "Lioua",
    "M'chouneche",
    "M'lili",
    "Mekhadma",
    "Meziraa",
    "Oumache",
    "Ourlal",
    "Sidi Okba",
    "Tolga",
    "Zeribet El Oued",
  ],
  8: [
    "Abadla",
    "Bechar",
    "Beni Ounif",
    "Boukais",
    "Erg Ferradj",
    "Kenadsa",
    "Lahmar",
    "Mechraa H.boumediene",
    "Meridja",
    "Mogheul",
    "Taghit",
  ],
  9: [
    "Ain Romana",
    "Beni Mered",
    "Beni Tamou",
    "Benkhelil",
    "Blida",
    "Bouarfa",
    "Boufarik",
    "Bougara",
    "Bouinan",
    "Chebli",
    "Chiffa",
    "Chrea",
    "Djebabra",
    "El Affroun",
    "Guerrouaou",
    "Hammam Melouane",
    "Larbaa",
    "Meftah",
    "Mouzaia",
    "Oued Djer",
    "Oued El Alleug",
    "Ouled Slama",
    "Ouled Yaich",
    "Souhane",
    "Souma",
  ],
  10: [
    "Aghbalou",
    "Ahl El Ksar",
    "Ain Bessem",
    "Ain El Hadjar",
    "Ain Laloui",
    "Ain Turk",
    "Ait Laaziz",
    "Aomar",
    "Bechloul",
    "Bir Ghbalou",
    "Bordj Okhriss",
    "Bouderbala",
    "Bouira",
    "Boukram",
    "Chorfa",
    "Dechmia",
    "Dirah",
    "Djebahia",
    "El Adjiba",
    "El Asnam",
    "El Hachimia",
    "El Hakimia",
    "El Khabouzia",
    "El Mokrani",
    "Guerrouma",
    "Hadjera Zerga",
    "Haizer",
    "Hanif",
    "Kadiria",
    "Lakhdaria",
    "M Chedallah",
    "Maala",
    "Mamora",
    "Mezdour",
    "Oued El Berdi",
    "Ouled Rached",
    "Raouraoua",
    "Ridane",
    "Saharidj",
    "Souk El Khemis",
    "Sour El Ghozlane",
    "Taghzout",
    "Taguedite",
    "Taourirt",
    "Z'barbar",
  ],
  11: ["Abalessa", "Ain Amguel", "Idles", "Tamanrasset", "Tazrouk"],
  12: [
    "Ain Zerga",
    "Bedjene",
    "Bekkaria",
    "Bir Dheheb",
    "Bir El Ater",
    "Bir Mokkadem",
    "Boukhadra",
    "Boulhaf Dyr",
    "Cheria",
    "El Aouinet",
    "El Houidjbet",
    "El Kouif",
    "El Malabiod",
    "El Meridj",
    "El Mezeraa",
    "El Ogla",
    "El Ogla El Malha",
    "Ferkane",
    "Guorriguer",
    "Hammamet",
    "Morssot",
    "Negrine",
    "Ouenza",
    "Oum Ali",
    "Saf Saf El Ouesra",
    "Stah Guentis",
    "Tebessa",
    "Telidjen",
  ],
  13: [
    "Ain Fettah",
    "Ain Fezza",
    "Ain Ghoraba",
    "Ain Kebira",
    "Ain Nehala",
    "Ain Tallout",
    "Ain Youcef",
    "Amieur",
    "Azails",
    "Bab El Assa",
    "Beni Bahdel",
    "Beni Boussaid",
    "Beni Khaled",
    "Beni Mester",
    "Beni Ouarsous",
    "Beni Smiel",
    "Beni Snous",
    "Bensekrane",
    "Bouhlou",
    "Bouihi",
    "Chetouane",
    "Dar Yaghmouracene",
    "Djebala",
    "El Aricha",
    "El Fehoul",
    "El Gor",
    "Fellaoucene",
    "Ghazaouet",
    "Hammam Boughrara",
    "Hennaya",
    "Honaine",
    "Maghnia",
    "Mansourah",
    "Marsa Ben M'hidi",
    "Msirda Fouaga",
    "Nedroma",
    "Oued Chouly",
    "Ouled Mimoun",
    "Ouled Riyah",
    "Remchi",
    "Sabra",
    "Sebbaa Chioukh",
    "Sebdou",
    "Sidi Abdelli",
    "Sidi Djilali",
    "Sidi Medjahed",
    "Souahlia",
    "Souani",
    "Souk Tleta",
    "Terny Beni Hediel",
    "Tianet",
    "Tlemcen",
    "Zenata",
  ],
  14: [
    "Ain Bouchekif",
    "Ain Deheb",
    "Ain El Hadid",
    "Ain Kermes",
    "Ain Zarit",
    "Bougara",
    "Chehaima",
    "Dahmouni",
    "Djebilet Rosfa",
    "Djillali Ben Amar",
    "Faidja",
    "Frenda",
    "Guertoufa",
    "Hamadia",
    "Ksar Chellala",
    "Madna",
    "Mahdia",
    "Mechraa Safa",
    "Medrissa",
    "Medroussa",
    "Meghila",
    "Mellakou",
    "Nadorah",
    "Naima",
    "Oued Lilli",
    "Rahouia",
    "Rechaiga",
    "Sebaine",
    "Sebt",
    "Serghine",
    "Si Abdelghani",
    "Sidi Abderrahmane",
    "Sidi Ali Mellal",
    "Sidi Bakhti",
    "Sidi Hosni",
    "Sougueur",
    "Tagdemt",
    "Takhemaret",
    "Tiaret",
    "Tidda",
    "Tousnina",
    "Zmalet El Emir Abdelkade",
  ],
  15: [
    "Abi Youcef",
    "Aghribs",
    "Agouni Gueghrane",
    "Ain El Hammam",
    "Ain Zaouia",
    "Ait Aggouacha",
    "Ait Bouaddou",
    "Ait Boumehdi",
    "Ait Chafaa",
    "Ait Khellili",
    "Ait Mahmoud",
    "Ait Oumalou",
    "Ait Toudert",
    "Ait Yahia",
    "Ait Yahia Moussa",
    "Akbil",
    "Akerrou",
    "Assi Youcef",
    "Azazga",
    "Azeffoun",
    "Beni Aissi",
    "Beni Douala",
    "Beni Yenni",
    "Beni Zikki",
    "Beni Zmenzer",
    "Boghni",
    "Boudjima",
    "Bounouh",
    "Bouzeguene",
    "Djebel Aissa Mimoun",
    "Draa Ben Khedda",
    "Draa El Mizan",
    "Freha",
    "Frikat",
    "Iboudrarene",
    "Idjeur",
    "Iferhounene",
    "Ifigha",
    "Iflissen",
    "Illilten",
    "Illoula Oumalou",
    "Imsouhal",
    "Irdjen",
    "Larba Nath Irathen",
    "Larbaa Nath Irathen",
    "M'kira",
    "Maatkas",
    "Makouda",
    "Mechtras",
    "Mekla",
    "Mizrana",
    "Ouacif",
    "Ouadhias",
    "Ouaguenoune",
    "Sidi Naamane",
    "Souamaa",
    "Souk El Thenine",
    "Tadmait",
    "Tigzirt",
    "Timizart",
    "Tirmitine",
    "Tizi Ghenif",
    "Tizi N'tleta",
    "Tizi Ouzou",
    "Tizi Rached",
    "Yakourene",
    "Yatafene",
    "Zekri",
  ],
  16: [
    "Ain Benian",
    "Ain Taya",
    "Alger Centre",
    "Bab El Oued",
    "Bab Ezzouar",
    "Baba Hesen",
    "Bachedjerah",
    "Bains Romains",
    "Baraki",
    "Ben Aknoun",
    "Beni Messous",
    "Bir Mourad Rais",
    "Bir Touta",
    "Birkhadem",
    "Bologhine Ibnou Ziri",
    "Bordj El Bahri",
    "Bordj El Kiffan",
    "Bourouba",
    "Bouzareah",
    "Casbah",
    "Cheraga",
    "Dar El Beida",
    "Dely Ibrahim",
    "Djasr Kasentina",
    "Douira",
    "Draria",
    "El Achour",
    "El Biar",
    "El Harrach",
    "El Madania",
    "El Magharia",
    "El Merssa",
    "El Mouradia",
    "Herraoua",
    "Hussein Dey",
    "Hydra",
    "Kheraisia",
    "Kouba",
    "Les Eucalyptus",
    "Maalma",
    "Mohamed Belouzdad",
    "Mohammadia",
    "Oued Koriche",
    "Oued Smar",
    "Ouled Chebel",
    "Ouled Fayet",
    "Rahmania",
    "Rais Hamidou",
    "Reghaia",
    "Rouiba",
    "Sehaoula",
    "Setaouali",
    "Sidi M'hamed",
    "Sidi Moussa",
    "Souidania",
    "Tessala El Merdja",
    "Zeralda",
  ],
  17: [
    "Ain Chouhada",
    "Ain El Ibel",
    "Ain Fekka",
    "Ain Maabed",
    "Ain Oussera",
    "Amourah",
    "Benhar",
    "Benyagoub",
    "Birine",
    "Bouira Lahdab",
    "Charef",
    "Dar Chioukh",
    "Deldoul",
    "Djelfa",
    "Douis",
    "El Guedid",
    "El Idrissia",
    "El Khemis",
    "Faidh El Botma",
    "Guernini",
    "Guettara",
    "Had Sahary",
    "Hassi Bahbah",
    "Hassi El Euch",
    "Hassi Fedoul",
    "M Liliha",
    "Messaad",
    "Moudjebara",
    "Oum Laadham",
    "Sed Rahal",
    "Selmana",
    "Sidi Baizid",
    "Sidi Ladjel",
    "Tadmit",
    "Zaafrane",
    "Zaccar",
  ],
  18: [
    "Bordj Tahar",
    "Boudria Beniyadjis",
    "Bouraoui Belhadef",
    "Boussif Ouled Askeur",
    "Chahna",
    "Chekfa",
    "Djemaa Beni Habibi",
    "Djimla",
    "El Ancer",
    "El Aouana",
    "El Kennar Nouchfi",
    "El Milia",
    "Emir Abdelkader",
    "Erraguene",
    "Ghebala",
    "Jijel",
    "Khiri Oued Adjoul",
    "Kouas",
    "Oudjana",
    "Ouled Rabah",
    "Ouled Yahia Khadrouch",
    "Selma Benziada",
    "Settara",
    "Sidi Abdelaziz",
    "Sidi Marouf",
    "Taher",
    "Texena",
    "Ziama Mansouria",
  ],
  19: [
    "Ain Abessa",
    "Ain Arnat",
    "Ain Azel",
    "Ain El Kebira",
    "Ain Lahdjar",
    "Ain Legradj",
    "Ain Oulmane",
    "Ain Roua",
    "Ain Sebt",
    "Ait Naoual Mezada",
    "Ait Tizi",
    "Amoucha",
    "Babor",
    "Bazer Sakra",
    "Beidha Bordj",
    "Bellaa",
    "Beni Aziz",
    "Beni Chebana",
    "Beni Fouda",
    "Beni Mouhli",
    "Beni Ouartilane",
    "Beni Oussine",
    "Bir El Arch",
    "Bir Haddada",
    "Bouandas",
    "Bougaa",
    "Bousselam",
    "Boutaleb",
    "Dehamcha",
    "Djemila",
    "Draa Kebila",
    "El Eulma",
    "El Ouldja",
    "El Ouricia",
    "Guellal",
    "Guelta Zerka",
    "Guenzet",
    "Guidjel",
    "Hamam Soukhna",
    "Hamma",
    "Hammam Guergour",
    "Harbil",
    "Ksar El Abtal",
    "Maaouia",
    "Maouaklane",
    "Mezloug",
    "Oued El Barad",
    "Ouled Addouane",
    "Ouled Sabor",
    "Ouled Si Ahmed",
    "Ouled Tebben",
    "Rosfa",
    "Salah Bey",
    "Serdj El Ghoul",
    "Setif",
    "Tachouda",
    "Tala Ifacene",
    "Taya",
    "Tella",
    "Tizi N'bechar",
  ],
  20: [
    "Ain El Hadjar",
    "Ain Sekhouna",
    "Ain Soltane",
    "Doui Thabet",
    "El Hassasna",
    "Hounet",
    "Maamora",
    "Moulay Larbi",
    "Ouled Brahim",
    "Ouled Khaled",
    "Saida",
    "Sidi Ahmed",
    "Sidi Amar",
    "Sidi Boubekeur",
    "Tircine",
    "Youb",
  ],
  21: [
    "Ain Bouziane",
    "Ain Charchar",
    "Ain Kechera",
    "Ain Zouit",
    "Azzaba",
    "Bekkouche Lakhdar",
    "Ben Azzouz",
    "Beni Bechir",
    "Beni Oulbane",
    "Beni Zid",
    "Bin El Ouiden",
    "Bouchetata",
    "Cheraia",
    "Collo",
    "Djendel Saadi Mohamed",
    "El Arrouch",
    "El Ghedir",
    "El Hadaiek",
    "El Marsa",
    "Emjez Edchich",
    "Es Sebt",
    "Filfila",
    "Hamadi Krouma",
    "Kanoua",
    "Kerkera",
    "Khenag Mayoum",
    "Oued Zhour",
    "Ouldja Boulbalout",
    "Ouled Attia",
    "Ouled Habbeba",
    "Oum Toub",
    "Ramdane Djamel",
    "Salah Bouchaour",
    "Sidi Mezghiche",
    "Skikda",
    "Tamalous",
    "Zerdezas",
    "Zitouna",
  ],
  22: [
    "Ain Adden",
    "Ain El Berd",
    "Ain Kada",
    "Ain Thrid",
    "Ain Tindamine",
    "Amarnas",
    "Badredine El Mokrani",
    "Belarbi",
    "Ben Badis",
    "Benachiba Chelia",
    "Bir El Hammam",
    "Boudjebaa El Bordj",
    "Boukhanafis",
    "Chetouane Belaila",
    "Dhaya",
    "El Hacaiba",
    "Hassi Dahou",
    "Hassi Zahana",
    "Lamtar",
    "M'cid",
    "Makedra",
    "Marhoum",
    "Merine",
    "Mezaourou",
    "Mostefa Ben Brahim",
    "Moulay Slissen",
    "Oued Sebaa",
    "Oued Sefioun",
    "Oued Taourira",
    "Ras El Ma",
    "Redjem Demouche",
    "Sehala Thaoura",
    "Sfissef",
    "Sidi Ali Benyoub",
    "Sidi Ali Boussidi",
    "Sidi Bel Abbes",
    "Sidi Brahim",
    "Sidi Chaib",
    "Sidi Dahou Zairs",
    "Sidi Hamadouche",
    "Sidi Khaled",
    "Sidi Lahcene",
    "Sidi Yacoub",
    "Tabia",
    "Tafissour",
    "Taoudmout",
    "Teghalimet",
    "Telagh",
    "Tenira",
    "Tessala",
    "Tilmouni",
    "Zerouala",
  ],
  23: [
    "Ain Berda",
    "Annaba",
    "Berrahel",
    "Chetaibi",
    "Cheurfa",
    "El Bouni",
    "El Hadjar",
    "Eulma",
    "Oued El Aneb",
    "Seraidi",
    "Sidi Amar",
    "Treat",
  ],
  24: [
    "Ain Ben Beida",
    "Ain Hessania",
    "Ain Larbi",
    "Ain Makhlouf",
    "Ain Reggada",
    "Belkheir",
    "Ben Djarah",
    "Beni Mezline",
    "Bordj Sabat",
    "Bou Hachana",
    "Bou Hamdane",
    "Bouati Mahmoud",
    "Bouchegouf",
    "Bouhamra Ahmed",
    "Dahouara",
    "Djeballah Khemissi",
    "El Fedjoudj",
    "Guelaat Bou Sbaa",
    "Guelma",
    "Hamam Debagh",
    "Hammam N'bail",
    "Heliopolis",
    "Khezara",
    "Medjez Amar",
    "Medjez Sfa",
    "Nechmaya",
    "Oued Cheham",
    "Oued Fragha",
    "Oued Zenati",
    "Ras El Agba",
    "Roknia",
    "Sellaoua Announa",
    "Sidi Sandel",
    "Tamlouka",
  ],
  25: [
    "Ain Abid",
    "Ain Smara",
    "Ben Badis",
    "Beni Hamidene",
    "Constantine",
    "Didouche Mourad",
    "El Khroub",
    "Hamma Bouziane",
    "Ibn Ziad",
    "Messaoud Boujeriou",
    "Ouled Rahmouni",
    "Zighoud Youcef",
  ],
  26: [
    "Ain Boucif",
    "Ain Ouksir",
    "Aissaouia",
    "Aziz",
    "Baata",
    "Ben Chicao",
    "Beni Slimane",
    "Berrouaghia",
    "Bir Ben Laabed",
    "Boghar",
    "Bouaiche",
    "Bouaichoune",
    "Bouchrahil",
    "Boughzoul",
    "Bouskene",
    "Chabounia",
    "Chelalet El Adhaoura",
    "Cheniguel",
    "Damiat",
    "Derrag",
    "Deux Bassins",
    "Djouab",
    "Draa Essamar",
    "El Azizia",
    "El Guelbelkebir",
    "El Hamdania",
    "El Omaria",
    "El Ouinet",
    "Hannacha",
    "Kef Lakhdar",
    "Khams Djouamaa",
    "Ksar El Boukhari",
    "Maghraoua",
    "Medea",
    "Medjebar",
    "Meftaha",
    "Mezerana",
    "Mihoub",
    "Ouamri",
    "Oued Harbil",
    "Ouled Antar",
    "Ouled Bouachra",
    "Ouled Brahim",
    "Ouled Deid",
    "Ouled Hellal",
    "Ouled Maaref",
    "Oum El Djellil",
    "Ouzera",
    "Rebaia",
    "Saneg",
    "Sedraya",
    "Seghouane",
    "Si Mahdjoub",
    "Sidi Demed",
    "Sidi Naamane",
    "Sidi Rabie",
    "Sidi Zahar",
    "Sidi Ziane",
    "Souagui",
    "Tablat",
    "Tafraout",
    "Tamesguida",
    "Tletat Ed Douair",
    "Zoubiria",
  ],
  27: [
    "Achaacha",
    "Ain Boudinar",
    "Ain Nouissy",
    "Ain Sidi Cherif",
    "Ain Tedles",
    "Benabdelmalek Ramdane",
    "Bouguirat",
    "Fornaka",
    "Hadjadj",
    "Hassi Mameche",
    "Hassiane",
    "Khadra",
    "Kheir Eddine",
    "Mansourah",
    "Mazagran",
    "Mesra",
    "Mostaganem",
    "Nekmaria",
    "Oued El Kheir",
    "Ouled Boughalem",
    "Ouled Maalah",
    "Safsaf",
    "Sayada",
    "Sidi Ali",
    "Sidi Belaattar",
    "Sidi Lakhdar",
    "Sirat",
    "Souaflia",
    "Sour",
    "Stidia",
    "Tazgait",
    "Touahria",
  ],
  28: [
    "Ain El Hadjel",
    "Ain El Melh",
    "Ain Fares",
    "Ain Khadra",
    "Ain Rich",
    "Belaiba",
    "Ben Srour",
    "Beni Ilmane",
    "Benzouh",
    "Berhoum",
    "Bir Foda",
    "Bou Saada",
    "Bouti Sayeh",
    "Chellal",
    "Dehahna",
    "Djebel Messaad",
    "El Hamel",
    "El Houamed",
    "Hammam Dalaa",
    "Khettouti Sed El Jir",
    "Khoubana",
    "M'cif",
    "M'sila",
    "M'tarfa",
    "Maadid",
    "Maarif",
    "Magra",
    "Medjedel",
    "Menaa",
    "Mohamed Boudiaf",
    "Ouanougha",
    "Ouled Addi Guebala",
    "Ouled Derradj",
    "Ouled Madhi",
    "Ouled Mansour",
    "Ouled Sidi Brahim",
    "Ouled Slimane",
    "Oulteme",
    "Sidi Aissa",
    "Sidi Ameur",
    "Sidi Hadjeres",
    "Sidi M'hamed",
    "Slim",
    "Souamaa",
    "Tamsa",
    "Tarmount",
    "Zarzour",
  ],
  29: [
    "Ain Fares",
    "Ain Fekan",
    "Ain Ferah",
    "Ain Frass",
    "Alaimia",
    "Aouf",
    "Benian",
    "Bou Henni",
    "Bouhanifia",
    "Chorfa",
    "El Bordj",
    "El Gaada",
    "El Ghomri",
    "El Gueitena",
    "El Hachem",
    "El Keurt",
    "El Mamounia",
    "El Menaouer",
    "Ferraguig",
    "Froha",
    "Gharrous",
    "Ghriss",
    "Guerdjoum",
    "Hacine",
    "Khalouia",
    "Makhda",
    "Maoussa",
    "Mascara",
    "Matemore",
    "Mocta Douz",
    "Mohammadia",
    "Nesmot",
    "Oggaz",
    "Oued El Abtal",
    "Oued Taria",
    "Ras El Ain Amirouche",
    "Sedjerara",
    "Sehailia",
    "Sidi Abdeldjebar",
    "Sidi Abdelmoumene",
    "Sidi Boussaid",
    "Sidi Kada",
    "Sig",
    "Tighennif",
    "Tizi",
    "Zahana",
    "Zelamta",
  ],
  30: [
    "Ain Beida",
    "El Borma",
    "Hassi Ben Abdellah",
    "Hassi Messaoud",
    "N'goussa",
    "Ouargla",
    "Rouissat",
    "Sidi Khouiled",
  ],
  31: [
    "Ain Biya",
    "Ain Kerma",
    "Ain Turk",
    "Arzew",
    "Ben Freha",
    "Bethioua",
    "Bir El Djir",
    "Boufatis",
    "Bousfer",
    "Boutlelis",
    "El Ancar",
    "El Braya",
    "El Kerma",
    "Es Senia",
    "Gdyel",
    "Hassi Ben Okba",
    "Hassi Bounif",
    "Hassi Mefsoukh",
    "Marsat El Hadjadj",
    "Mers El Kebir",
    "Messerghin",
    "Oran",
    "Oued Tlelat",
    "Sidi Ben Yebka",
    "Sidi Chami",
    "Tafraoui",
  ],
  32: [
    "Ain El Orak",
    "Arbaouat",
    "Boualem",
    "Bougtoub",
    "Boussemghoun",
    "Brezina",
    "Cheguig",
    "Chellala",
    "El Bayadh",
    "El Biodh Sidi Cheikh",
    "El Bnoud",
    "El Kheither",
    "El Mehara",
    "Ghassoul",
    "Kef El Ahmar",
    "Krakda",
    "Rogassa",
    "Sidi Ameur",
    "Sidi Slimane",
    "Sidi Tifour",
    "Stitten",
    "Tousmouline",
  ],
  33: ["Bordj Omar Driss", "Debdeb", "Illizi", "In Amenas"],
  34: [
    "Ain Taghrout",
    "Ain Tesra",
    "Belimour",
    "Ben Daoud",
    "Bir Kasdali",
    "Bordj Bou Arreridj",
    "Bordj Ghdir",
    "Bordj Zemora",
    "Colla",
    "Djaafra",
    "El Ach",
    "El Achir",
    "El Anseur",
    "El Hamadia",
    "El M'hir",
    "El Main",
    "Ghilassa",
    "Haraza",
    "Hasnaoua",
    "Khelil",
    "Ksour",
    "Mansoura",
    "Medjana",
    "Ouled Brahem",
    "Ouled Dahmane",
    "Ouled Sidi Brahim",
    "Rabta",
    "Ras El Oued",
    "Sidi Embarek",
    "Tafreg",
    "Taglait",
    "Teniet En Nasr",
    "Tesmart",
    "Tixter",
  ],
  35: [
    "Afir",
    "Ammal",
    "Baghlia",
    "Ben Choud",
    "Beni Amrane",
    "Bordj Menaiel",
    "Boudouaou",
    "Boudouaou El Bahri",
    "Boumerdes",
    "Bouzegza Keddara",
    "Chabet El Ameur",
    "Corso",
    "Dellys",
    "Djinet",
    "El Kharrouba",
    "Hammedi",
    "Isser",
    "Khemis El Khechna",
    "Larbatache",
    "Leghata",
    "Naciria",
    "Ouled Aissa",
    "Ouled Hedadj",
    "Ouled Moussa",
    "Si Mustapha",
    "Sidi Daoud",
    "Souk El Haad",
    "Taourga",
    "Thenia",
    "Tidjelabine",
    "Timezrit",
    "Zemmouri",
  ],
  36: [
    "Ain El Assel",
    "Ain Kerma",
    "Asfour",
    "Ben M Hidi",
    "Berrihane",
    "Besbes",
    "Bougous",
    "Bouhadjar",
    "Bouteldja",
    "Chebaita Mokhtar",
    "Chefia",
    "Chihani",
    "Drean",
    "Echatt",
    "El Aioun",
    "El Kala",
    "El Tarf",
    "Hammam Beni Salah",
    "Lac Des Oiseaux",
    "Oued Zitoun",
    "Raml Souk",
    "Souarekh",
    "Zerizer",
    "Zitouna",
  ],
  37: ["Oum El Assel", "Tindouf"],
  38: [
    "Ammari",
    "Beni Chaib",
    "Beni Lahcene",
    "Bordj Bounaama",
    "Bordj El Emir Abdelkader",
    "Bou Caid",
    "Khemisti",
    "Larbaa",
    "Lardjem",
    "Layoune",
    "Lazharia",
    "Maacem",
    "Melaab",
    "Ouled Bessem",
    "Sidi Abed",
    "Sidi Boutouchent",
    "Sidi Lantri",
    "Sidi Slimane",
    "Tamellalet",
    "Theniet El Had",
    "Tissemsilt",
    "Youssoufia",
  ],
  39: [
    "Bayadha",
    "Ben Guecha",
    "Debila",
    "Douar El Maa",
    "El Ogla",
    "El Oued",
    "Guemar",
    "Hamraia",
    "Hassani Abdelkrim",
    "Hassi Khalifa",
    "Kouinine",
    "Magrane",
    "Mih Ouansa",
    "Nakhla",
    "Oued El Alenda",
    "Ourmes",
    "Reguiba",
    "Robbah",
    "Sidi Aoun",
    "Taghzout",
    "Taleb Larbi",
    "Trifaoui",
  ],
  40: [
    "Ain Touila",
    "Babar",
    "Baghai",
    "Bouhmama",
    "Chelia",
    "Cherchar",
    "Djellal",
    "El Hamma",
    "El Mahmal",
    "El Oueldja",
    "Ensigha",
    "Kais",
    "Khenchela",
    "Khirane",
    "M'sara",
    "M'toussa",
    "Ouled Rechache",
    "Remila",
    "Tamza",
    "Taouzianat",
    "Yabous",
  ],
  41: [
    "Ain Soltane",
    "Ain Zana",
    "Bir Bouhouche",
    "Drea",
    "Haddada",
    "Hanencha",
    "Khedara",
    "Khemissa",
    "M'daourouche",
    "Machroha",
    "Merahna",
    "Oued Kebrit",
    "Ouled Driss",
    "Ouled Moumen",
    "Oum El Adhaim",
    "Quillen",
    "Ragouba",
    "Safel El Ouiden",
    "Sedrata",
    "Sidi Fredj",
    "Souk Ahras",
    "Taoura",
    "Terraguelt",
    "Tiffech",
    "Zaarouria",
    "Zouabi",
  ],
  42: [
    "Aghbal",
    "Ahmer El Ain",
    "Ain Tagourait",
    "Attatba",
    "Beni Mileuk",
    "Bou Haroun",
    "Bou Ismail",
    "Bourkika",
    "Chaiba",
    "Cherchell",
    "Damous",
    "Douaouda",
    "Fouka",
    "Gouraya",
    "Hadjout",
    "Hadjret Ennous",
    "Khemisti",
    "Kolea",
    "Larhat",
    "Menaceur",
    "Merad",
    "Messelmoun",
    "Nador",
    "Sidi Amar",
    "Sidi Ghiles",
    "Sidi Rached",
    "Sidi Semiane",
    "Tipaza",
  ],
  43: [
    "Ahmed Rachedi",
    "Ain Beida Harriche",
    "Ain Mellouk",
    "Ain Tine",
    "Amira Arres",
    "Benyahia Abderrahmane",
    "Bouhatem",
    "Chelghoum Laid",
    "Chigara",
    "Derrahi Bousselah",
    "El Mechira",
    "Elayadi Barbes",
    "Ferdjioua",
    "Grarem Gouga",
    "Hamala",
    "Mila",
    "Minar Zarza",
    "Oued Athmenia",
    "Oued Endja",
    "Oued Seguen",
    "Ouled Khalouf",
    "Rouached",
    "Sidi Khelifa",
    "Sidi Merouane",
    "Tadjenanet",
    "Tassadane Haddada",
    "Teleghma",
    "Terrai Bainem",
    "Tessala",
    "Tiberguent",
    "Yahia Beniguecha",
    "Zeghaia",
  ],
  44: [
    "Ain Benian",
    "Ain Bouyahia",
    "Ain Defla",
    "Ain Lechiakh",
    "Ain Soltane",
    "Ain Tork",
    "Arib",
    "Barbouche",
    "Bathia",
    "Belaas",
    "Ben Allal",
    "Bir Ould Khelifa",
    "Bordj Emir Khaled",
    "Boumedfaa",
    "Bourached",
    "Djelida",
    "Djemaa Ouled Cheikh",
    "Djendel",
    "El Abadia",
    "El Amra",
    "El Attaf",
    "El Maine",
    "Hammam Righa",
    "Hassania",
    "Hoceinia",
    "Khemis Miliana",
    "Mekhatria",
    "Miliana",
    "Oued Chorfa",
    "Oued Djemaa",
    "Rouina",
    "Sidi Lakhdar",
    "Tacheta Zegagha",
    "Tarik Ibn Ziad",
    "Tiberkanine",
    "Zeddine",
  ],
  45: [
    "Ain Ben Khelil",
    "Ain Safra",
    "Assela",
    "Djeniane Bourzeg",
    "El Biod",
    "Kasdir",
    "Makman Ben Amer",
    "Mecheria",
    "Moghrar",
    "Naama",
    "Sfissifa",
    "Tiout",
  ],
  46: [
    "Aghlal",
    "Ain El Arbaa",
    "Ain Kihal",
    "Ain Temouchent",
    "Ain Tolba",
    "Aoubellil",
    "Beni Saf",
    "Bouzedjar",
    "Chaabat El Ham",
    "Chentouf",
    "El Amria",
    "El Malah",
    "El Messaid",
    "Emir Abdelkader",
    "Hammam Bouhadjar",
    "Hassasna",
    "Hassi El Ghella",
    "Oued Berkeche",
    "Oued Sebbah",
    "Ouled Boudjemaa",
    "Ouled Kihal",
    "Oulhaca El Gheraba",
    "Sidi Ben Adda",
    "Sidi Boumediene",
    "Sidi Ouriache",
    "Sidi Safi",
    "Tamzoura",
    "Terga",
  ],
  47: [
    "Berriane",
    "Bounoura",
    "Dhayet Bendhahoua",
    "El Atteuf",
    "El Guerrara",
    "Ghardaia",
    "Mansoura",
    "Metlili",
    "Sebseb",
    "Zelfana",
  ],
  48: [
    "Ain Rahma",
    "Ain Tarek",
    "Ammi Moussa",
    "Belaassel Bouzagza",
    "Bendaoud",
    "Beni Dergoun",
    "Beni Zentis",
    "Dar Ben Abdelah",
    "Djidiouia",
    "El Guettar",
    "El H'madna",
    "El Hassi",
    "El Matmar",
    "El Ouldja",
    "Had Echkalla",
    "Hamri",
    "Kalaa",
    "Lahlef",
    "Mazouna",
    "Mediouna",
    "Mendes",
    "Merdja Sidi Abed",
    "Ouarizane",
    "Oued El Djemaa",
    "Oued Essalem",
    "Oued Rhiou",
    "Ouled Aiche",
    "Ouled Sidi Mihoub",
    "Ramka",
    "Relizane",
    "Sidi Khettab",
    "Sidi Lazreg",
    "Sidi M'hamed Benali",
    "Sidi M'hamed Benaouda",
    "Sidi Saada",
    "Souk El Had",
    "Yellel",
    "Zemmoura",
  ],
  49: [
    "Aougrout",
    "Charouine",
    "Deldoul",
    "Ksar Kaddour",
    "Metarfa",
    "Ouled Aissa",
    "Ouled Said",
    "Talmine",
    "Timimoun",
    "Tinerkouk",
  ],
  50: ["Bordj Badji Mokhtar", "Timiaouine"],
  51: [
    "Besbes",
    "Chaiba",
    "Doucen",
    "Ouled Djellal",
    "Ras El Miad",
    "Sidi Khaled",
  ],
  52: [
    "Beni Abbes",
    "Beni Ikhlef",
    "El Ouata",
    "Igli",
    "Kerzaz",
    "Ksabi",
    "Ouled Khoudir",
    "Tabelbala",
    "Tamtert",
    "Timoudi",
  ],
  53: ["Foggaret Azzaouia", "In Ghar", "In Salah"],
  54: ["In Guezzam", "Tin Zouatine"],
  55: [
    "Benaceur",
    "Blidet Amor",
    "El Alia",
    "El Hadjira",
    "Megarine",
    "Mnaguer",
    "Nezla",
    "Sidi Slimane",
    "Taibet",
    "Tebesbest",
    "Temacine",
    "Touggourt",
    "Zaouia El Abidia",
  ],
  56: ["Bordj El Haouasse", "Djanet"],
  57: [
    "Djamaa",
    "El M'ghair",
    "Mrara",
    "Oum Touyour",
    "Sidi Amrane",
    "Sidi Khelil",
    "Still",
    "Tenedla",
  ],
  58: ["El Meniaa", "Hassi Fehal", "Hassi Gara"],
};


const wilayaNameToCode = {
  Adrar: 1,
  Chlef: 2,
  Laghouat: 3,
  "Oum El Bouaghi": 4,
  Batna: 5,
  Béjaïa: 6,
  Biskra: 7,
  Béchar: 8,
  Blida: 9,
  Bouïra: 10,
  Tamanrasset: 11,
  Tébessa: 12,
  Tebessa: 12,
  Tlemcen: 13,
  Tiaret: 14,
  "Tizi Ouzou": 15,
  Alger: 16,
  Djelfa: 17,
  Jijel: 18,
  Sétif: 19,
  Saïda: 20,
  Skikda: 21,
  "Sidi Bel Abbès": 22,
  Annaba: 23,
  Guelma: 24,
  Constantine: 25,
  Médéa: 26,
  Mostaganem: 27,
  Msila: 28,
  Mascara: 29,
  Ouargla: 30,
  Oran: 31,
  "El Bayadh": 32,
  Illizi: 33,
  "Bordj Bou Arreridj": 34,
  Boumerdès: 35,
  "El Tarf": 36,
  Tindouf: 37,
  Tissemsilt: 38,
  "El Oued": 39,
  Khenchela: 40,
  "Souk Ahras": 41,
  Tipaza: 42,
  Mila: 43,
  "Aïn Defla": 44,
  Naâma: 45,
  "Aïn Témouchent": 46,
  Ghardaïa: 47,
  Relizane: 48,
  Timimoun: 49,
  "Bordj Badji Mokhtar": 50,
  "Ouled Djellal": 51,
  "Béni Abbès": 52,
  "In Salah": 53,
  "In Guezzam": 54,
  Touggourt: 55,
  Djanet: 56,
  "El Mghair": 57,
  "El Meniaa": 58,
};
const FREE_SHIPPING_PRODUCT_ID = "f00000000000000000000005";
export default function OrderForm({ prod, cart, order }) {
  const FullPath =usePathname() || "none"
  const [isSubmitting, setIsSubmitting] = useState(false);
  const s = typeof window !== "undefined" ? window.localStorage : null;
  const id = prod;

  const { clearCart, cartProducts, setCart } = useContext(CartContext);
  let modify = false;
  order ? (modify = true) : (modify = false);
  modify && setCart();

  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(null);
  const [firstName, setFirstName] = useState(s?.getItem("firstName") || "");
  const [lastName, setLastName] = useState(s?.getItem("lastName") || "");
  const [state, setState] = useState(s?.getItem("state") || "Alger");
  const [city, setCity] = useState(s?.getItem("city") || "");
  const [homeAddress, setHomeAddress] = useState(
    s?.getItem("homeAddress") || ""
  );
  const [phoneNumber1, setPhoneNumber1] = useState(
    s?.getItem("phoneNumber1") || ""
  );
  const [phoneNumber2, setPhoneNumber2] = useState(
    s?.getItem("phoneNumber2") || ""
  );
  const [email, setEmail] = useState(
    s?.getItem("email") || ""
  );
  const [delivery, setDelivery] = useState(s?.getItem("delivery") || "home");
  const [deliveryCatalog, setDeliveryCatalog] = useState(null);
  const [selectedWilayaId, setSelectedWilayaId] = useState(null);
  const [selectedWilayaName, setSelectedWilayaName] = useState(
    s?.getItem("state") || "Alger"
  );
  const [products, setProducts] = useState([]);
  const [variant, setVariant] = useState("40");
  const router = useRouter();

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const response = await fetch("/api/ecotrack/catalog");
        if (!response.ok) {
          throw new Error("Failed to load Ecotrack catalog");
        }

        setDeliveryCatalog(await response.json());
      } catch (error) {
        console.error(error);
      }
    };

    loadCatalog();
  }, []);

  useEffect(() => {
    if (!deliveryCatalog || selectedWilayaId != null) {
      return;
    }

    const savedCode = s?.getItem("stateCode");
    const fromCode = savedCode
      ? deliveryCatalog.wilayas.find(
          (wilaya) => wilaya.wilayaId === Number(savedCode),
        ) ?? null
      : null;
    const fromName = findWilayaByName(
      deliveryCatalog.wilayas,
      s?.getItem("state"),
    );
    const initialWilaya = fromCode ?? fromName ?? null;

    if (initialWilaya) {
      setSelectedWilayaId(initialWilaya.wilayaId);
      setSelectedWilayaName(initialWilaya.name);
      setState(initialWilaya.name);
    }
  }, [deliveryCatalog, selectedWilayaId, s]);

  const availableCommunes = getCommunesForWilaya(deliveryCatalog, selectedWilayaId);
  const selectedCommune =
    availableCommunes.find((commune) => commune.name === city) ?? null;
  const officeAvailable = selectedCommune ? selectedCommune.hasStopDesk : true;

  useEffect(() => {
    if (city && !availableCommunes.some((commune) => commune.name === city)) {
      setCity("");
    }
  }, [availableCommunes, city]);

  useEffect(() => {
    if (delivery === "office" && city && !officeAvailable) {
      setDelivery("home");
    }
  }, [city, delivery, officeAvailable]);

  useEffect(() => {
    if (cart && cartProducts.length > 0) {
      fetch("/api/cart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: cartProducts }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error("Failed to fetch products");
          }
          return response.json();
        })
        .then((data) => {
          setProducts(data);
        })
        .catch((error) => {
          console.error(error);
        });
    } else {
      setProducts([]);
    }
  }, [cartProducts, cart]);

  function handleMinus() {
    if (quantity > 1) {
      setQuantity(quantity - 1);
    } else null;
  }
  useEffect(() => {
    const getPrice = async () => {
      if (id) {
        try {
          const response = await fetch("/api/checkout?id=" + id);
          const data2 = await response.json();
          setPrice(data2.price);
        } catch (error) {
          console.error(error);
        }
      }
    };

    getPrice();
  }, [id]);
const hasFreeShippingProduct = cart
  ? cartProducts.length > 0 && cartProducts.every(productId => productId === FREE_SHIPPING_PRODUCT_ID)
  : id === FREE_SHIPPING_PRODUCT_ID;
  const del_pr = hasFreeShippingProduct
    ? 0
    : findDeliveryFee(deliveryCatalog, selectedWilayaId, delivery);

  const t = useTranslations("checkout");


  let subtotal = 0;
  for (const productId of cartProducts) {
    const price = products.find((p) => p._id === productId)?.price || 0;
    subtotal += price;
  }

  const total = del_pr;
  const prodOrCart = cart ? subtotal : price * quantity;

  // Check if this order matches the last successful order
  function isDuplicateOrder(currentOrder) {
    const lastOrder = s?.getItem("lastOrder");
    if (!lastOrder) return false;

    try {
      const parsedLastOrder = JSON.parse(lastOrder);
      const now = Date.now();

      // Check if last order was within the last 5 minutes (300000ms)
      if (now - parsedLastOrder.timestamp > 300000) {
        return false;
      }

      // Compare key fields
      return (
        parsedLastOrder.phoneNumber1 === currentOrder.phoneNumber1 &&
        parsedLastOrder.city === currentOrder.city &&
        parsedLastOrder.delivery === currentOrder.delivery &&
        parsedLastOrder.total === currentOrder.total
      );
    } catch (error) {
      console.error("Error checking duplicate order:", error);
      return false;
    }
  }
  function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function saveOrder(ev) {
  ev.preventDefault();
  if (isSubmitting) return;

  const time = Math.floor(Date.now() / 1000);
  const ev_id = uuidv4();

  const orderData = {
    phoneNumber1,
    city,
    delivery,
    total: del_pr + prodOrCart,
  };

  if (isDuplicateOrder(orderData)) {
    alert("Cette commande a déjà été envoyée récemment...");
    return;
  }

  setIsSubmitting(true);

  // Save to localStorage
  s.setItem("firstName", firstName);
  s.setItem("lastName", lastName);
  s.setItem("state", selectedWilayaName || state);
  if (selectedWilayaId) {
    s.setItem("stateCode", String(selectedWilayaId));
  } else {
    s.removeItem("stateCode");
  }
  s.setItem("city", city);
  s.setItem("homeAddress", homeAddress);
  s.setItem("phoneNumber1", phoneNumber1);
  s.setItem("phoneNumber2", phoneNumber2);
  s.setItem("email", email);
  s.setItem("cartProducts", cart ? cartProducts : Array(quantity).fill(id));
  s.setItem("delivery", delivery);
  s.setItem("del_pr", del_pr);
  s.setItem("subtotal", cart ? subtotal : price * quantity);

  const data = {
    firstName,
    lastName,
    state: selectedWilayaId ?? state,
    city,
    homeAddress,
    confirmed: "nocon",
    phoneNumber1,
    phoneNumber2,
    email,
    cartProducts: cart ? cartProducts : Array(quantity).fill(id),
    delivery,
    variant,
    total,
    time,
    del_pr,
    ev_id,
    visitId: getVisitIdFromCookie(),
    journeyId: getOrCreateJourneyId(),
    sessionId: getOrCreateSessionId(),
    // Just read cookies - server SDK handles the rest
    fbp: getCookie("_fbp") || null,
    fbc: getCookie("_fbc") || null,
    url: FullPath,
  };

  try {
    const response = await axios.post("/api/orders", data);

    if (response.status === 200) {
      s.setItem(
        "lastOrder",
        JSON.stringify({
          phoneNumber1,
          city,
          delivery,
          total: del_pr + prodOrCart,
          timestamp: Date.now(),
        })
      );

      enrichPastEvents().catch((err) =>
        console.error("Enrichment failed:", err)
      );

      const purchaseProducts = cart ? products : [{ _id: id, id, price: price }];

      const purchasePromise = handlePurchase({
        products: purchaseProducts,
        totalValue: del_pr + prodOrCart,
        eventId: ev_id,
        eventTime: time,
        additionalUserData: {
          em: email,
          fn: firstName,
          ln: lastName,
          ph: phoneNumber1,
          ct: city,
          st: state,
          external_id: getOrCreateExternalId(),
        },
      }).catch((err) => console.error("Purchase tracking failed:", err));

      await Promise.race([purchasePromise, sleep(700)]);
      clearCart();
      router.push(order ? "/thank-you?modified=true" : "/thank-you");
    } else {
      alert("Une erreur est survenue lors de la creation de la commande");
    }
  } catch (error) {
    alert("Une erreur est survenue lors de la creation de la commande: " + error);
  }

  setTimeout(() => setIsSubmitting(false), 6000);
}
  // Rest of the component code...

  return (
    <div className="">
      <div className="    flex   text-gray-100   justify-center">
        <div
          dir="ltr"
          className="flex  bg-green-500 rounded-full font-medium text-lg px-3 py-1 align-middle"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="white"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="size-5 mt-1"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
            />
          </svg>
          :0795 34 28 26
        </div>
      </div>

      <h1 className="text-2xl font-medium mt-12 mb-5">{t("info")}:</h1>
      <form onSubmit={saveOrder}>
        <label className="text-lg  ">
          {t("nom")}
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            type="text"
            name="lastName"
            className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black rounded-full w-full  text-lg px-2 py-2 outline-none transition-all duration-500"
            placeholder=""
          ></input>
        </label>
                <label className="text-lg  ">
          {t("pre")}
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            type="text"
            name="firstName"
            className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black rounded-full w-full  text-lg px-2 py-2 outline-none transition-all duration-500"
            placeholder=""
          ></input>
        </label>
        <label className="text-lg  ">{t("wil")}</label>
        <select
          value={selectedWilayaId ?? ""}
          onChange={(e) => {
            const wilaya = deliveryCatalog?.wilayas.find(
              (entry) => entry.wilayaId === Number(e.target.value),
            );
            setSelectedWilayaId(wilaya?.wilayaId ?? null);
            setSelectedWilayaName(wilaya?.name ?? "");
            setState(wilaya?.name ?? "");
          }}
          className="mt-2 mb-6 ring-1 ring-gray-300  bg-transparent focus:ring-black rounded-full w-full  text-lg px-2  py-2 outline-none transition-all duration-500"
        >
          <option value="">-- {t("wil")} --</option>
          {(deliveryCatalog?.wilayas ?? []).map((wilaya) => (
            <option key={wilaya.wilayaId} value={wilaya.wilayaId}>
              {wilaya.wilayaId}.{t(wilaya.name)}
            </option>
          ))}
        </select>

        <label className="text-lg">{t("comm")}</label>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="mt-2 mb-6 ring-1 ring-gray-300 bg-transparent focus:ring-black rounded-full w-full text-lg px-2 py-2 outline-none transition-all duration-500"
          disabled={selectedWilayaId == null || availableCommunes.length === 0}
          required
        >
          <option value="">-- {t("comm")} --</option>
          {availableCommunes.map((commune) => (
            <option key={commune.communeId} value={commune.name}>
              {commune.name}
            </option>
          ))}
        </select>

        <label className="text-lg  ">
          {t("addr")}
          <input
            value={homeAddress}
            onChange={(e) => setHomeAddress(e.target.value)}
            name="homeAddress"
            type="text"
            className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black rounded-full w-full  text-lg px-2 py-2 outline-none transition-all duration-500"
            placeholder=""
          ></input>
        </label>
        <label className="text-lg  ">
          {t("tel")}
          <input
            required
            value={phoneNumber1}
            name="phoneNumber"
            onChange={(e) => setPhoneNumber1(e.target.value)}
            type="tel"
            className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black rounded-full w-full  text-lg px-2 py-2 outline-none transition-all duration-500"
            placeholder=""
          ></input>
        </label>
                <label className="text-lg  ">
          {t("mail")}
          <input
            value={email}
            name="email"
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            className="mt-2 mb-6 ring-1 ring-gray-300 focus:ring-black rounded-full w-full  text-lg px-2 py-2 outline-none transition-all duration-500"
            placeholder=""
          ></input>
        </label>
        <label className="text-lg ">{t("selec")}:</label>
        <div className="flex mt-2 gap-2 mb-2 justify-between md:mx-12">
          <label htmlFor="rad1">
            {" "}
            <div
              className={
                "   mb-2 py-2 px-1  lg:px-24 rounded-lg  hover:cursor-pointer text-center  " +
                (delivery === "home"
                  ? " bg-teal-600 text-white "
                  : "ring-1 ring-black")
              }
            >
              <input
                type="radio"
                className="appearance-none"
                id="rad1"
                name="livraison"
                value="home"
                onChange={(e) => setDelivery(e.target.value)}
              />
              <span className=" font-medium">{t("dom")}</span>
            </div>
          </label>
          <label htmlFor="rad2">
            <div
              className={
                "   mb-2 py-2 px-2     lg:px-24 rounded-lg   text-center hover:cursor-pointer  " +
                (delivery === "office"
                  ? " bg-teal-600 text-white "
                  : " ring-1 ring-black") +
                (!officeAvailable ? " opacity-50" : "")
              }
            >
              <input
                type="radio"
                className="appearance-none"
                id="rad2"
                name="livraison"
                value="office"
                disabled={!officeAvailable}
                onChange={(e) => setDelivery(e.target.value)}
              />
              <span className=" font-medium">{t("off")}</span>
            </div>
          </label>
        </div>
        {id && id === "f00000000000000000000001" && (
          <div className="mt-6">
            <label className="text-lg ">{t("selec2")}:</label>
            <div className="text-center">
              <label className="text-2xl">{t("size")}: </label>
              <select
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
                className="mt-2 mb-6 ring-1 ring-gray-300  bg-transparent focus:ring-black rounded-full   text-xl px-1  py-1 outline-none transition-all duration-500"
              >
                {" "}
                <option value="39">39</option>
                <option value="40">40</option>
                <option value="41">41</option>
                <option value="42">42</option>
                <option value="43">43</option>
                <option value="44">44</option>
                <option value="45">45</option>
                <option value="46">46</option>
              </select>
            </div>
          </div>
        )}

        {!cart && (
          <div>
            <label className="text-lg  ">{t("quant")}:</label>
            <div
              dir="ltr"
              class="inline-flex mt-2 rounded-full w-full justify-center mx-auto items-center scale-90"
            >
              <button
                type="button"
                onClick={() => handleMinus()}
                class="ring-1 text-3xl  text-center w-1/4 ring-slate-300 bg-teal-600 text-white  font-bold py-2 px-4 rounded-l-full"
              >
                -
              </button>
              <div class="border-y-2 text-3xl w-1/4 text-center border-slate-300 font-bold py-[6.5px] px-4">
                {quantity}
              </div>
              <button
                type="button"
                onClick={() => setQuantity(quantity + 1)}
                class="ring-1 text-3xl  text-center w-1/4 ring-slate-300 bg-teal-600 text-white  font-bold py-2 px-4 rounded-r-full"
              >
                +
              </button>
            </div>
          </div>
        )}
        <div className="flex border-b border-emerald-700 justify-between mb-2 mt-6">
          <span className=" font-semibold text-lg ">{t("sous")}:</span>
          <span className=" font-bold text-lg text-emerald-700 ">
            {cart ? subtotal : price * quantity}
            {t("da")}
          </span>
        </div>
        { (del_pr > 70 || hasFreeShippingProduct ) && prodOrCart  > 1490  ? (
          <div>
            <div className="flex border-b border-emerald-700 justify-between mb-2">
              <span className=" font-semibold text-lg">{t("liv")}:</span>
              <span className=" font-bold text-lg text-emerald-700">
                {del_pr}
                {t("da")}
              </span>
            </div>
            <div className="flex border-b border-emerald-700 justify-between mb-2">
              <span className=" font-semibold text-lg">{t("tot")}:</span>
              <span className=" font-bold text-lg text-emerald-700">
                {cart ? subtotal + del_pr : price + del_pr}
                {t("da")}
              </span>
            </div>
          </div>
        ) : (
          <span className=" font-semibold text-red-500">{prodOrCart < 1490 ? t("pdc") :t("pd")}</span>
        )}

        {(del_pr > 70 || hasFreeShippingProduct )  && prodOrCart  > 1490 ? (
          <div className="flex text-center text-white m-2 mt-6">
            {order ? (
              <button
                type="submit"
                className="bg-teal-600 px-6 py-2 w-full rounded-lg text-xl font-semibold"
              >
                {t("modi")}{" "}
              </button>
            ) : (
              <button
                type="submit"
                className="bg-orange-600 animate-pulse px-6 py-2 w-full rounded-lg text-xl font-semibold"
              >
                {" "}
                {t("conf")}
              </button>
            )}
          </div>
        ) : null}
      </form>
      {prodOrCart < 1490  && (
        <div className="w-full">
          <SimBrand brandid="f00000000000000000000006"/>
        </div>
      )}
    </div>
  );
}
