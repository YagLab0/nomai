-- The seed used to point every listing at https://picsum.photos/seed/<slug>-N —
-- random stock photos unrelated to the Lodging. It now ships root-relative
-- /images/* paths of curated shots (apps/web/public/images, resolved against
-- PUBLIC_WEB_URL when the API serializes), and NO rows for cities without
-- curated coverage (Buenos Aires, Ciudad de México, Bogotá, Mendoza): better
-- no photo than a wrong one.
--
-- Delete every picsum row carrying a seed id (pho_lst_*) — Owner-uploaded
-- rows (pho_<random>_*) are untouched — then insert the curated set. Rows
-- keep their deterministic ids so reruns are no-ops.

delete from public.listing_photos
where id like 'pho\_lst\_%'
  and url like 'https://picsum.photos/%';

insert into public.listing_photos (id,listing_id,url,alt_text,position,is_cover) values
('pho_lst_floripa_quarto_1','lst_floripa_quarto','/images/floripa-ingleses.webp','Agua turquesa y gente bañándose en Praia dos Ingleses, Florianópolis',0,true),
('pho_lst_floripa_quarto_2','lst_floripa_quarto','/images/floripa-praia-brava.webp','Praia Brava vista desde arriba, con casas frente al mar, en Florianópolis',1,false),
('pho_lst_floripa_quarto_3','lst_floripa_quarto','/images/floripa-lagoinha-do-leste.webp','La playa de Lagoinha do Leste entre cerros verdes, en Florianópolis',2,false),
('pho_lst_floripa_casa_1','lst_floripa_casa','/images/floripa-praia-brava.webp','Praia Brava vista desde arriba, con casas frente al mar, en Florianópolis',0,true),
('pho_lst_floripa_casa_2','lst_floripa_casa','/images/floripa-lagoinha-do-leste.webp','La playa de Lagoinha do Leste entre cerros verdes, en Florianópolis',1,false),
('pho_lst_floripa_casa_3','lst_floripa_casa','/images/floripa-ingleses.webp','Agua turquesa y gente bañándose en Praia dos Ingleses, Florianópolis',2,false),
('pho_lst_cusco_hab_1','lst_cusco_hab','/images/cusco-machu-picchu.jpg','Machu Picchu al amanecer, cerca de Cusco',0,true),
('pho_lst_cusco_depto_1','lst_cusco_depto','/images/cusco-machu-picchu.jpg','Machu Picchu al amanecer, cerca de Cusco',0,true),
('pho_lst_cartagena_hab_1','lst_cartagena_hab','/images/cartagena-torre-reloj.webp','La Torre del Reloj y la plaza, en Cartagena',0,true),
('pho_lst_cartagena_hab_2','lst_cartagena_hab','/images/cartagena-casas.webp','Casas coloniales de colores con flores en los balcones, en Cartagena',1,false),
('pho_lst_cartagena_hab_3','lst_cartagena_hab','/images/cartagena-balcon.webp','Balcón de madera pintado de colores en Getsemaní, Cartagena',2,false),
('pho_lst_cartagena_casa_1','lst_cartagena_casa','/images/cartagena-casas.webp','Casas coloniales de colores con flores en los balcones, en Cartagena',0,true),
('pho_lst_cartagena_casa_2','lst_cartagena_casa','/images/cartagena-balcon.webp','Balcón de madera pintado de colores en Getsemaní, Cartagena',1,false),
('pho_lst_cartagena_casa_3','lst_cartagena_casa','/images/cartagena-torre-reloj.webp','La Torre del Reloj y la plaza, en Cartagena',2,false),
('pho_lst_casa_de_adobe_1','lst_casa_de_adobe','/images/cafayate-habitacion.webp','Habitación con cama de hierro y veladores en Cafayate',0,true),
('pho_lst_casa_de_adobe_2','lst_casa_de_adobe','/images/cafayate-vinedos.webp','Viñedos de Cafayate con los cerros de fondo',1,false),
('pho_lst_casa_de_adobe_3','lst_casa_de_adobe','/images/quebrada-de-las-conchas.webp','Ruta entre las formaciones rojas de la Quebrada de las Conchas',2,false),
('pho_lst_posada_el_algarrobo_1','lst_posada_el_algarrobo','/images/salta-catedral.webp','Fachada de la Catedral Basílica de Salta',0,true),
('pho_lst_posada_el_algarrobo_2','lst_posada_el_algarrobo','/images/salta-san-francisco.webp','Fachada de la Basílica de San Francisco, en Salta',1,false),
('pho_lst_posada_el_algarrobo_3','lst_posada_el_algarrobo','/images/salta-teleferico.webp','Salta vista desde el teleférico al cerro San Bernardo',2,false),
('pho_lst_cabanas_siete_colores_1','lst_cabanas_siete_colores','/images/purmamarca-siete-colores.webp','Las franjas de colores del Cerro de los Siete Colores, en Purmamarca',0,true),
('pho_lst_cabanas_siete_colores_2','lst_cabanas_siete_colores','/images/purmamarca-adobe.webp','Casas de adobe al pie de un cerro rojo en Purmamarca',1,false),
('pho_lst_cabanas_siete_colores_3','lst_cabanas_siete_colores','/images/purmamarca-feria.webp','Puestos de tejidos en una calle de Purmamarca',2,false),
('pho_lst_hostel_la_quebrada_1','lst_hostel_la_quebrada','/images/tilcara-pucara-ruinas.webp','Muros de piedra del Pucará de Tilcara',0,true),
('pho_lst_hostel_la_quebrada_2','lst_hostel_la_quebrada','/images/tilcara-pucara.webp','Cardones y el monumento del Pucará de Tilcara',1,false),
('pho_lst_hostel_la_quebrada_3','lst_hostel_la_quebrada','/images/tilcara-patio.webp','Patio con mesas y paredes rosadas en Tilcara',2,false),
('pho_lst_casona_guemes_1','lst_casona_guemes','/images/salta-teleferico.webp','Salta vista desde el teleférico al cerro San Bernardo',0,true),
('pho_lst_casona_guemes_2','lst_casona_guemes','/images/salta-san-francisco.webp','Fachada de la Basílica de San Francisco, en Salta',1,false),
('pho_lst_casona_guemes_3','lst_casona_guemes','/images/salta-catedral.webp','Fachada de la Catedral Basílica de Salta',2,false),
('pho_lst_cabana_vinas_del_sol_1','lst_cabana_vinas_del_sol','/images/cafayate-vinedos.webp','Viñedos de Cafayate con los cerros de fondo',0,true),
('pho_lst_cabana_vinas_del_sol_2','lst_cabana_vinas_del_sol','/images/quebrada-de-las-conchas.webp','Ruta entre las formaciones rojas de la Quebrada de las Conchas',1,false),
('pho_lst_cabana_vinas_del_sol_3','lst_cabana_vinas_del_sol','/images/cafayate-habitacion.webp','Habitación con cama de hierro y veladores en Cafayate',2,false),
('pho_lst_posada_quebrada_alta_1','lst_posada_quebrada_alta','/images/humahuaca-valle.webp','Humahuaca y su valle, con los cerros al fondo',0,true),
('pho_lst_posada_quebrada_alta_2','lst_posada_quebrada_alta','/images/humahuaca-cerros.webp','Cerros de franjas de colores bajo las nubes, en Humahuaca',1,false),
('pho_lst_posada_quebrada_alta_3','lst_posada_quebrada_alta','/images/humahuaca-hornocal.webp','La Serranía de Hornocal desde el mirador, cerca de Humahuaca',2,false),
('pho_lst_casa_los_colorados_1','lst_casa_los_colorados','/images/purmamarca-feria.webp','Puestos de tejidos en una calle de Purmamarca',0,true),
('pho_lst_casa_los_colorados_2','lst_casa_los_colorados','/images/purmamarca-adobe.webp','Casas de adobe al pie de un cerro rojo en Purmamarca',1,false),
('pho_lst_casa_los_colorados_3','lst_casa_los_colorados','/images/salinas-grandes.webp','Piletones de agua sobre la sal blanca de Salinas Grandes',2,false),
('pho_lst_posada_el_patio_1','lst_posada_el_patio','/images/tilcara-patio.webp','Patio con mesas y paredes rosadas en Tilcara',0,true),
('pho_lst_posada_el_patio_2','lst_posada_el_patio','/images/tilcara-pucara.webp','Cardones y el monumento del Pucará de Tilcara',1,false),
('pho_lst_posada_el_patio_3','lst_posada_el_patio','/images/tilcara-pucara-ruinas.webp','Muros de piedra del Pucará de Tilcara',2,false),
('pho_lst_cabanas_hornocal_1','lst_cabanas_hornocal','/images/humahuaca-hornocal.webp','La Serranía de Hornocal desde el mirador, cerca de Humahuaca',0,true),
('pho_lst_cabanas_hornocal_2','lst_cabanas_hornocal','/images/humahuaca-cerros.webp','Cerros de franjas de colores bajo las nubes, en Humahuaca',1,false),
('pho_lst_cabanas_hornocal_3','lst_cabanas_hornocal','/images/humahuaca-valle.webp','Humahuaca y su valle, con los cerros al fondo',2,false),
('pho_lst_posada_marina_1','lst_posada_marina','/images/floripa-praia-brava.webp','Praia Brava vista desde arriba, con casas frente al mar, en Florianópolis',0,true),
('pho_lst_posada_marina_2','lst_posada_marina','/images/floripa-ingleses.webp','Agua turquesa y gente bañándose en Praia dos Ingleses, Florianópolis',1,false),
('pho_lst_posada_marina_3','lst_posada_marina','/images/floripa-lagoinha-do-leste.webp','La playa de Lagoinha do Leste entre cerros verdes, en Florianópolis',2,false),
('pho_lst_casa_duna_1','lst_casa_duna','/images/floripa-ingleses.webp','Agua turquesa y gente bañándose en Praia dos Ingleses, Florianópolis',0,true),
('pho_lst_casa_duna_2','lst_casa_duna','/images/floripa-lagoinha-do-leste.webp','La playa de Lagoinha do Leste entre cerros verdes, en Florianópolis',1,false),
('pho_lst_casa_duna_3','lst_casa_duna','/images/floripa-praia-brava.webp','Praia Brava vista desde arriba, con casas frente al mar, en Florianópolis',2,false),
('pho_lst_casa_getsemani_1','lst_casa_getsemani','/images/cartagena-balcon.webp','Balcón de madera pintado de colores en Getsemaní, Cartagena',0,true),
('pho_lst_casa_getsemani_2','lst_casa_getsemani','/images/cartagena-casas.webp','Casas coloniales de colores con flores en los balcones, en Cartagena',1,false),
('pho_lst_casa_getsemani_3','lst_casa_getsemani','/images/cartagena-torre-reloj.webp','La Torre del Reloj y la plaza, en Cartagena',2,false),
('pho_lst_casa_de_los_almendros_1','lst_casa_de_los_almendros','/images/cartagena-casas.webp','Casas coloniales de colores con flores en los balcones, en Cartagena',0,true),
('pho_lst_casa_de_los_almendros_2','lst_casa_de_los_almendros','/images/cartagena-torre-reloj.webp','La Torre del Reloj y la plaza, en Cartagena',1,false),
('pho_lst_casa_de_los_almendros_3','lst_casa_de_los_almendros','/images/cartagena-balcon.webp','Balcón de madera pintado de colores en Getsemaní, Cartagena',2,false),
('pho_lst_hostal_licancabur_1','lst_hostal_licancabur','/images/atacama-laguna-lejia.webp','Volcanes reflejados en la Laguna Lejía, cerca de San Pedro de Atacama',0,true),
('pho_lst_hostal_licancabur_2','lst_hostal_licancabur','/images/atacama-valle-de-la-luna.webp','Las crestas del Valle de la Luna, en San Pedro de Atacama',1,false),
('pho_lst_hostal_licancabur_3','lst_hostal_licancabur','/images/atacama-baltinache.webp','Laguna turquesa sobre la sal en Baltinache, San Pedro de Atacama',2,false),
('pho_lst_casa_del_salar_1','lst_casa_del_salar','/images/atacama-baltinache.webp','Laguna turquesa sobre la sal en Baltinache, San Pedro de Atacama',0,true),
('pho_lst_casa_del_salar_2','lst_casa_del_salar','/images/atacama-valle-de-la-luna.webp','Las crestas del Valle de la Luna, en San Pedro de Atacama',1,false),
('pho_lst_casa_del_salar_3','lst_casa_del_salar','/images/atacama-laguna-lejia.webp','Volcanes reflejados en la Laguna Lejía, cerca de San Pedro de Atacama',2,false),
('pho_lst_posada_del_porton_1','lst_posada_del_porton','/images/colonia-portal.webp','Puerta antigua con una santa rita en flor, en Colonia del Sacramento',0,true),
('pho_lst_posada_del_porton_2','lst_posada_del_porton','/images/colonia-faro.webp','El faro de Colonia del Sacramento entre árboles',1,false),
('pho_lst_posada_del_porton_3','lst_posada_del_porton','/images/colonia-cafe.webp','Un café bajo un árbol con un auto antiguo, en Colonia del Sacramento',2,false),
('pho_lst_casa_la_rambla_1','lst_casa_la_rambla','/images/colonia-faro.webp','El faro de Colonia del Sacramento entre árboles',0,true),
('pho_lst_casa_la_rambla_2','lst_casa_la_rambla','/images/colonia-cafe.webp','Un café bajo un árbol con un auto antiguo, en Colonia del Sacramento',1,false),
('pho_lst_casa_la_rambla_3','lst_casa_la_rambla','/images/colonia-portal.webp','Puerta antigua con una santa rita en flor, en Colonia del Sacramento',2,false),
('pho_lst_casa_cenote_1','lst_casa_cenote','/images/tulum-palapa.webp','Techo de palma frente a la playa entre palmeras, en Tulum',0,true),
('pho_lst_casa_cenote_2','lst_casa_cenote','/images/tulum-ruinas.webp','Las ruinas mayas de Tulum sobre el acantilado y el mar Caribe',1,false),
('pho_lst_casa_cenote_3','lst_casa_cenote','/images/tulum-bici.webp','Una bicicleta blanca bajo el cartel Follow that dream, en Tulum',2,false),
('pho_lst_depto_aldea_zama_1','lst_depto_aldea_zama','/images/tulum-bici.webp','Una bicicleta blanca bajo el cartel Follow that dream, en Tulum',0,true),
('pho_lst_depto_aldea_zama_2','lst_depto_aldea_zama','/images/tulum-ruinas.webp','Las ruinas mayas de Tulum sobre el acantilado y el mar Caribe',1,false),
('pho_lst_depto_aldea_zama_3','lst_depto_aldea_zama','/images/tulum-palapa.webp','Techo de palma frente a la playa entre palmeras, en Tulum',2,false)
on conflict do nothing;
