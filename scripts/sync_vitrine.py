#!/usr/bin/env python3
"""Baixa a vitrine pública de afiliado (collshp.com/<usuario>) e grava produtos.json só com itens de corrida de rua.
Só biblioteca padrão. Se a chamada falhar, mantém o arquivo atual (sai com erro para o aviso aparecer no Actions)."""
import json, re, sys, urllib.request, uuid
from datetime import datetime, timezone
from pathlib import Path

USUARIO = "dyoliveirayt"
AFILIADO = {"affiliateId": "18329290204", "userId": "293512929"}   # identificadores públicos da vitrine (aparecem no próprio site)
URL_API = "https://collshp.com/api/v3/gql/graphql?q=StorefrontProductListQuery"
DEST = Path(__file__).resolve().parent.parent / "produtos.json"
QUERY = ("query StorefrontProductListQuery($urlSuffix: String, $keyword: String, $sortType: SortType, $groupId: Long, $linkId: Long, "
         "$page: LinktreelandingpagePaginationInput, $listType: MyCollectionListType, $affiliateMeta: AffiliateMetaInput, $buyerId: Long, "
         "$uuId: String, $deviceId: String, $cid: String, $language: String) { storefrontProductList(urlSuffix: $urlSuffix, keyword: $keyword, "
         "sortType: $sortType, groupId: $groupId, linkId: $linkId, page: $page, listType: $listType, affiliateMeta: $affiliateMeta, buyerId: $buyerId, "
         "uuId: $uuId, deviceId: $deviceId, cid: $cid, language: $language) { itemList { linkId link linkName image linkType itemId isPined h5Link itemCard } "
         "pagination { offset limit hasMore totalCount } } }")

# O que entra na Loja do corredor (e o que fica de fora) — ajuste aqui se quiser mudar o critério
ENTRA = re.compile(r"corrida|maratona|running|endurance|n[úu]mero de peito|isot[ôo]nico|eletr[óo]lit|\bgel\b|ciclismo|esportivo|melhores tempos|manguito", re.I)
SAI = re.compile(r"motocross|velocross|enduro|camping|acampamento|colch[ãa]o|barraca|lamp|l[âa]mpada|guiador|impermeabilizante|country|churrasco|pit bike", re.I)
CATEGORIAS = [  # (nome, padrão) — a primeira que casar vale
    ("Nutrição", re.compile(r"isot[ôo]nico|eletr[óo]lit|\bgel\b|carb|sach[êe]|energia|whey|suplemento", re.I)),
    ("Óculos", re.compile(r"[óo]culos", re.I)),
    ("Roupas", re.compile(r"manguito|camis|short|meia|viseira|bon[ée]|bandana|legging|jaqueta|top ", re.I)),
    ("Acessórios", re.compile(r"cinto|botton|clip|n[úu]mero de peito|bolsa|bra[çc]adeira|fone|rel[óo]gio|garrafa|squeeze|mochila", re.I)),
]

def categoria(nome):
    for cat, pad in CATEGORIAS:
        if pad.search(nome): return cat
    return "Para corredores"

def reais(micro):  # a API devolve o preço em 1/100000 de real
    return int(micro) / 100000

def fmt(v):
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def pagina(offset):
    corpo = {"operationName": "StorefrontProductListQuery", "query": QUERY, "variables": {
        "urlSuffix": USUARIO, "cid": "br", "language": "pt-BR", "sortType": "ITEM_CREATE_LATEST", "affiliateMeta": AFILIADO,
        "uuId": str(uuid.uuid4()), "deviceId": uuid.uuid4().hex.upper(),
        "page": {"offset": str(offset), "limit": "20", "hasMore": False, "totalCount": "0"}}}
    req = urllib.request.Request(URL_API, json.dumps(corpo).encode(), {
        "content-type": "application/json;charset=UTF-8", "accept": "application/json", "x-custom-userid": "corrida-rank",
        "user-agent": "Mozilla/5.0 (compatible; CorridaRank/1.0)", "referer": f"https://collshp.com/{USUARIO}?view=storefront"})
    return json.load(urllib.request.urlopen(req, timeout=40))["data"]["storefrontProductList"]

def main():
    itens, offset, vistos = [], 0, set()
    while True:
        sp = pagina(offset); lote = sp["itemList"]
        for x in lote:
            if x["itemId"] in vistos: continue
            vistos.add(x["itemId"]); itens.append(x)
        if not sp["pagination"]["hasMore"] or not lote: break
        offset += len(lote)
    saida = []
    for x in itens:
        nome = re.sub(r"\s+", " ", x["linkName"]).strip()
        if not ENTRA.search(nome) or SAI.search(nome): continue
        card = x["itemCard"]["itemCardDisplayedAsset"]; dado = x["itemCard"].get("itemData", {}).get("itemCardDisplayPrice", {})
        preco = reais(card["displayPrice"]["price"]); antes = reais(dado["strikethroughPrice"]) if dado.get("strikethroughPrice") else None
        saida.append({"id": x["itemId"], "titulo": nome, "url": x["link"], "categoria": categoria(nome),
            "imagem": f"https://down-br.img.susercontent.com/file/{card['images'][0]}_tn" if card.get("images") else x["image"],
            "preco": fmt(preco), "precoAntes": fmt(antes) if antes and antes > preco else None, "dica": card["displayPrice"].get("displayPriceAsset", {}).get("finalPriceHintText"),
            "desconto": (card.get("discountTag") or {}).get("discountText"), "vendidos": (card.get("soldCount") or {}).get("text")})
    if not saida: sys.exit("Nenhum produto de corrida encontrado; mantendo o arquivo atual.")
    DEST.write_text(json.dumps({"atualizado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "itens": saida}, ensure_ascii=False, indent=1), "utf-8")
    print(f"{len(saida)} produtos de corrida (de {len(itens)} na vitrine)")

if __name__ == "__main__":
    main()
