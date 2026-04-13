from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import models, schemas
from database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Mercearia API")

# Adicionar CORS para comunicação com frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"mensagem": "Bem-vindo à API da Mercearia"}


# ================= RESUMO/DASHBOARD =================

@app.get("/resumo")
def get_resumo(db: Session = Depends(get_db)):
    from sqlalchemy import func
    from datetime import datetime, timedelta
    
    hoje = datetime.now().date()
    ontem = hoje - timedelta(days=1)
    
    # Vendas de hoje
    vendas_hoje = db.query(func.sum(models.Venda.total)).filter(
        func.date(models.Venda.data) == hoje
    ).scalar() or 0
    
    qtd_vendas_hoje = db.query(func.count(models.Venda.id)).filter(
        func.date(models.Venda.data) == hoje
    ).scalar() or 0
    
    # Totais
    total_produtos = db.query(func.count(models.Produto.id)).scalar() or 0
    total_clientes = db.query(func.count(models.Cliente.id)).scalar() or 0
    total_dividas = db.query(func.sum(models.Cliente.divida)).scalar() or 0
    
    # Produtos mais vendidos
    mais_vendidos = db.query(
        models.Produto.nome,
        func.sum(models.ItemVenda.quantidade).label('quantidade')
    ).join(models.ItemVenda).group_by(models.Produto.id).order_by(
        func.sum(models.ItemVenda.quantidade).desc()
    ).limit(5).all()
    
    # Últimas vendas
    ultimas_vendas = db.query(
        models.Venda.id,
        models.Venda.total,
        models.Venda.data,
        models.Venda.tipo,
        models.Cliente.nome.label('cliente_nome')
    ).outerjoin(models.Cliente).order_by(
        models.Venda.data.desc()
    ).limit(10).all()
    
    return {
        "vendas_hoje": vendas_hoje,
        "qtd_vendas_hoje": qtd_vendas_hoje,
        "total_produtos": total_produtos,
        "total_clientes": total_clientes,
        "total_dividas": total_dividas,
        "mais_vendidos": [{"nome": m[0], "quantidade": m[1]} for m in mais_vendidos],
        "ultimas_vendas": [{"id": v[0], "total": v[1], "data": v[2], "tipo": v[3], "cliente_nome": v[4] or "Consumidor"} for v in ultimas_vendas]
    }

# ================= PRODUTOS =================

@app.post("/produtos")
def criar_produto(produto: schemas.ProdutoBase, db: Session = Depends(get_db)):
    novo = models.Produto(
        nome=produto.nome,
        preco=produto.preco,
        estoque=produto.estoque
    )
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo


@app.get("/produtos")
def listar_produtos(db: Session = Depends(get_db)):
    return db.query(models.Produto).all()


@app.get("/produtos/{produto_id}")
def obter_produto(produto_id: int, db: Session = Depends(get_db)):
    produto = db.query(models.Produto).filter(models.Produto.id == produto_id).first()
    if not produto:
        raise HTTPException(404, "Produto não encontrado")
    return produto


@app.put("/produtos/{produto_id}")
def atualizar_produto(produto_id: int, produto: schemas.ProdutoBase, db: Session = Depends(get_db)):
    db_produto = db.query(models.Produto).filter(models.Produto.id == produto_id).first()
    if not db_produto:
        raise HTTPException(404, "Produto não encontrado")
    db_produto.nome = produto.nome
    db_produto.preco = produto.preco
    db_produto.estoque = produto.estoque
    db.commit()
    db.refresh(db_produto)
    return db_produto


@app.delete("/produtos/{produto_id}")
def deletar_produto(produto_id: int, db: Session = Depends(get_db)):
    db_produto = db.query(models.Produto).filter(models.Produto.id == produto_id).first()
    if not db_produto:
        raise HTTPException(404, "Produto não encontrado")
    db.delete(db_produto)
    db.commit()
    return {"mensagem": "Produto deletado"}


# ================= CLIENTES =================

@app.post("/clientes")
def criar_cliente(cliente: schemas.ClienteBase, db: Session = Depends(get_db)):
    novo = models.Cliente(
        nome=cliente.nome,
        telefone=cliente.telefone,
        limite_fiado=cliente.limite_fiado,
        divida=0
    )
    db.add(novo)
    db.commit()
    db.refresh(novo)
    return novo


@app.get("/clientes")
def listar_clientes(db: Session = Depends(get_db)):
    return db.query(models.Cliente).all()


@app.get("/clientes/{cliente_id}")
def obter_cliente(cliente_id: int, db: Session = Depends(get_db)):
    cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(404, "Cliente não encontrado")
    return cliente


@app.put("/clientes/{cliente_id}")
def atualizar_cliente(cliente_id: int, cliente: schemas.ClienteBase, db: Session = Depends(get_db)):
    db_cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not db_cliente:
        raise HTTPException(404, "Cliente não encontrado")
    db_cliente.nome = cliente.nome
    db_cliente.telefone = cliente.telefone
    db_cliente.limite_fiado = cliente.limite_fiado
    db.commit()
    db.refresh(db_cliente)
    return db_cliente


@app.delete("/clientes/{cliente_id}")
def deletar_cliente(cliente_id: int, db: Session = Depends(get_db)):
    db_cliente = db.query(models.Cliente).filter(models.Cliente.id == cliente_id).first()
    if not db_cliente:
        raise HTTPException(404, "Cliente não encontrado")
    db.delete(db_cliente)
    db.commit()
    return {"mensagem": "Cliente deletado"}


# ================= VENDAS =================

@app.post("/vendas")
def registrar_venda(venda: schemas.Venda, db: Session = Depends(get_db)):
    total = 0

    nova_venda = models.Venda(cliente_id=venda.cliente_id, tipo=venda.tipo, total=0)
    db.add(nova_venda)
    db.commit()
    db.refresh(nova_venda)

    for item in venda.itens:
        produto = db.query(models.Produto).filter(models.Produto.id == item.produto_id).first()

        if not produto:
            raise HTTPException(404, "Produto não encontrado")

        if produto.estoque < item.quantidade:
            raise HTTPException(400, "Estoque insuficiente")

        produto.estoque -= item.quantidade

        total += item.preco * item.quantidade

        novo_item = models.ItemVenda(
            venda_id=nova_venda.id,
            produto_id=item.produto_id,
            quantidade=item.quantidade,
            preco_unitario=item.preco
        )
        db.add(novo_item)

    nova_venda.total = total

    if venda.cliente_id and venda.tipo == "fiado":
        cliente = db.query(models.Cliente).filter(models.Cliente.id == venda.cliente_id).first()
        if cliente:
            cliente.divida += total

    db.commit()

    return {"mensagem": "Venda registrada", "total": total, "venda_id": nova_venda.id}


@app.get("/vendas")
def listar_vendas(db: Session = Depends(get_db)):
    return db.query(models.Venda).all()


@app.get("/vendas/{venda_id}")
def obter_venda(venda_id: int, db: Session = Depends(get_db)):
    venda = db.query(models.Venda).filter(models.Venda.id == venda_id).first()
    if not venda:
        raise HTTPException(404, "Venda não encontrada")
    return venda


# ================= DEVEDORES =================

@app.get("/devedores")
def get_devedores(db: Session = Depends(get_db)):
    return db.query(models.Cliente).filter(models.Cliente.divida > 0).all()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
