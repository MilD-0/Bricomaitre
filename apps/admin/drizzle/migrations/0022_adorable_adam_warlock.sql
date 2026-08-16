ALTER TABLE "orders"
ALTER COLUMN "state" SET DATA TYPE integer
USING CASE
  WHEN "state" IS NULL OR btrim("state") = '' THEN NULL
  WHEN btrim("state") ~ '^[0-9]+$' THEN btrim("state")::integer
  WHEN btrim("state") IN ('Adrar') THEN 1
  WHEN btrim("state") IN ('Chlef') THEN 2
  WHEN btrim("state") IN ('Laghouat') THEN 3
  WHEN btrim("state") IN ('Oum El Bouaghi') THEN 4
  WHEN btrim("state") IN ('Batna') THEN 5
  WHEN btrim("state") IN ('Béjaïa', 'Bejaia') THEN 6
  WHEN btrim("state") IN ('Biskra') THEN 7
  WHEN btrim("state") IN ('Béchar', 'Bechar') THEN 8
  WHEN btrim("state") IN ('Blida') THEN 9
  WHEN btrim("state") IN ('Bouïra', 'Bouira') THEN 10
  WHEN btrim("state") IN ('Tamanrasset') THEN 11
  WHEN btrim("state") IN ('Tébessa', 'Tebessa') THEN 12
  WHEN btrim("state") IN ('Tlemcen') THEN 13
  WHEN btrim("state") IN ('Tiaret') THEN 14
  WHEN btrim("state") IN ('Tizi Ouzou') THEN 15
  WHEN btrim("state") IN ('Alger', 'Algiers') THEN 16
  WHEN btrim("state") IN ('Djelfa') THEN 17
  WHEN btrim("state") IN ('Jijel') THEN 18
  WHEN btrim("state") IN ('Sétif', 'Setif') THEN 19
  WHEN btrim("state") IN ('Saïda', 'Saida') THEN 20
  WHEN btrim("state") IN ('Skikda') THEN 21
  WHEN btrim("state") IN ('Sidi Bel Abbès', 'Sidi Bel Abbes') THEN 22
  WHEN btrim("state") IN ('Annaba') THEN 23
  WHEN btrim("state") IN ('Guelma') THEN 24
  WHEN btrim("state") IN ('Constantine') THEN 25
  WHEN btrim("state") IN ('Médéa', 'Medea') THEN 26
  WHEN btrim("state") IN ('Mostaganem') THEN 27
  WHEN btrim("state") IN ('Msila', 'M''Sila') THEN 28
  WHEN btrim("state") IN ('Mascara') THEN 29
  WHEN btrim("state") IN ('Ouargla') THEN 30
  WHEN btrim("state") IN ('Oran') THEN 31
  WHEN btrim("state") IN ('El Bayadh') THEN 32
  WHEN btrim("state") IN ('Illizi') THEN 33
  WHEN btrim("state") IN ('Bordj Bou Arreridj', 'Bordj Bou Arréridj') THEN 34
  WHEN btrim("state") IN ('Boumerdès', 'Boumerdes') THEN 35
  WHEN btrim("state") IN ('El Tarf') THEN 36
  WHEN btrim("state") IN ('Tindouf') THEN 37
  WHEN btrim("state") IN ('Tissemsilt') THEN 38
  WHEN btrim("state") IN ('El Oued') THEN 39
  WHEN btrim("state") IN ('Khenchela') THEN 40
  WHEN btrim("state") IN ('Souk Ahras') THEN 41
  WHEN btrim("state") IN ('Tipaza') THEN 42
  WHEN btrim("state") IN ('Mila') THEN 43
  WHEN btrim("state") IN ('Aïn Defla', 'Ain Defla') THEN 44
  WHEN btrim("state") IN ('Naâma', 'Naama') THEN 45
  WHEN btrim("state") IN ('Aïn Témouchent', 'Ain Temouchent') THEN 46
  WHEN btrim("state") IN ('Ghardaïa', 'Ghardaia') THEN 47
  WHEN btrim("state") IN ('Relizane') THEN 48
  WHEN btrim("state") IN ('Timimoun') THEN 49
  WHEN btrim("state") IN ('Bordj Badji Mokhtar') THEN 50
  WHEN btrim("state") IN ('Ouled Djellal') THEN 51
  WHEN btrim("state") IN ('Béni Abbès', 'Beni Abbes') THEN 52
  WHEN btrim("state") IN ('In Salah') THEN 53
  WHEN btrim("state") IN ('In Guezzam') THEN 54
  WHEN btrim("state") IN ('Touggourt') THEN 55
  WHEN btrim("state") IN ('Djanet') THEN 56
  WHEN btrim("state") IN ('El Mghair', 'El M''Ghair') THEN 57
  WHEN btrim("state") IN ('El Meniaa') THEN 58
  ELSE NULL
END;
