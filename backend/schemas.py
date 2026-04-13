from pydantic import BaseModel, field_validator
from typing import List, Optional
from datetime import datetime

# ================= PRODUTO =================
class ProdutoBase(BaseModel):
    nome: str
    preco: float
    estoque: int


class ProdutoCreate(ProdutoBase):
    pass


class Produto(ProdutoBase):
    id: int
    data_cadastro: datetime

    class Config:
        from_attributes = True


# ================= CLIENTE =================
class ClienteBase(BaseModel):
    nome: str
    telefone: Optional[str] = None
    limite_fiado: float = 0.0
    
    @field_validator('telefone', mode='before')
    @classmethod
    def limpar_telefone(cls, v):
        if v == "" or v is None:
            return None
        return v
    
    @field_validator('limite_fiado', mode='before')
    @classmethod
    def garantir_float(cls, v):
        if v is None or v == "":
            return 0.0
        return float(v)


class ClienteCreate(ClienteBase):
    pass


class Cliente(ClienteBase):
    id: int
    divida: float
    data_cadastro: datetime

    class Config:
        from_attributes = True


# ================= ITEM VENDA =================
class ItemVendaBase(BaseModel):
    produto_id: int
    quantidade: int
    preco: float


class ItemVenda(ItemVendaBase):
    id: int
    venda_id: int

    class Config:
        from_attributes = True


# ================= VENDA =================
class Venda(BaseModel):
    cliente_id: Optional[int]
    tipo: str  # cartao ou fiado
    itens: List[ItemVendaBase]


class VendaResponse(BaseModel):
    id: int
    cliente_id: Optional[int]
    tipo: str
    total: float
    data: datetime

    class Config:
        from_attributes = True


class ItemVendaCreate(ItemVendaBase):
    pass
    data: datetime
    itens: List[ItemVenda]

    class Config:
        from_attributes = True


# ================= PAGAMENTO =================
class PagamentoCreate(BaseModel):
    cliente_id: int
    valor: float