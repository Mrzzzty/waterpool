"""A flooded loop: low threshold, curved screens, tall offset well, return aisle.
The metre plan also supplies browser collisions, water boundaries and acoustics.
"""
from math import cos, sin, pi, radians
from bath_mesh import boundary_faces


def build(plan, slab, prism, poly, finish, material, look):
    tile=material('Shallow bath ivory ceramic',look['ceramicColor'],look['roughness'])
    bs=next(n for n in tile.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bs.inputs['Coat Weight'].default_value=look['clearcoat']
    bs.inputs['Coat Roughness'].default_value=look['clearcoatRoughness']
    plaster=material('Chalk soffit',(.67,.73,.70),.82)
    plaster['bathBoundaryUnion']=True
    stone=material('Pale integral coping',(.67,.72,.68),.47)
    opal=material('Sealed milk glass',(.74,.84,.87),.60,emit=.72)
    opal['bathGlazing']=True
    l,r,n,s=plan['bounds'];bed=plan['bed'];top=4.75
    wells=plan['lightWells'];zones=plan['ceilingZones']
    blocks=[]
    def block(a,b,c,d,low,high,m=tile):
        if b>a and d>c and high>low:
            blocks.append((a,b,low,high,c,d,m))
    def flush(name):
        boundary_faces(blocks,poly)
        blocks.clear()
        finish(name)
    def contains(bounds,x,z):
        a,b,c,d=bounds
        return a<x<b and c<z<d
    block(l,r,n,s,bed-.18,bed)
    block(l-.2,l,n,s,bed,top)
    block(l,r,s,s+.2,bed,top)
    # Offset arches leave water continuous between rooms. The curved screen
    # interrupts the apparent straight route without closing either end.
    for w in plan['partitions']:
        side=w['axis']=='x';at=w['at'];th=w['thick']
        a,b,lo,hi=w['from'],w['to'],w['lo'],w['hi']
        if side:a,b,lo,hi=-b,-a,-hi,-lo
        def face(profile):prism(profile,at-th/2,at+th/2,tile,side)
        def edge(i):
            t=pi*(1-i/32)
            return ((lo+hi)/2+cos(t)*(hi-lo)/2,w['sill']+sin(t)*w['rise'])
        # One concave U-shaped profile, with a continuous intrados. Separate
        # wedge prisms left coplanar internal caps and dark seams in the bake.
        face([(a,bed),(lo,bed),*[edge(i) for i in range(33)],
              (hi,bed),(b,bed),(b,top),(a,top)])
    for w in plan['arcWalls']:
        cx,cz=w['center'];inner=w['radius']-w['thickness']/2
        outer=w['radius']+w['thickness']/2;h=w['top'];count=w['segments']*3
        def point(t,r,y):return(cx+r*cos(t),y,cz+r*sin(t))
        for i in range(count):
            a=radians(w['start']+(w['end']-w['start'])*i/count)
            b=radians(w['start']+(w['end']-w['start'])*(i+1)/count)
            poly([point(a,inner,bed),point(b,inner,bed),point(b,inner,h),point(a,inner,h)],tile)
            poly([point(b,outer,bed),point(a,outer,bed),point(a,outer,h),point(b,outer,h)],tile)
            poly([point(a,inner,h),point(b,inner,h),point(b,outer,h),point(a,outer,h)],tile)
        for angle,reverse in [(w['start'],False),(w['end'],True)]:
            t=radians(angle)
            cap=[point(t,inner,bed),point(t,inner,h),point(t,outer,h),point(t,outer,bed)]
            poly(cap[::-1] if reverse else cap,tile)
    for a,b,c,d in plan['piers']:
        radius=.14
        corners=[(a+radius,c+radius,pi),(b-radius,c+radius,1.5*pi),
                 (b-radius,d-radius,0),(a+radius,d-radius,.5*pi)]
        ring=[(x+radius*cos(start+i*pi/16),z+radius*sin(start+i*pi/16))
              for x,z,start in corners for i in range(9)]
        for i,(x,z) in enumerate(ring):
            xx,zz=ring[(i+1)%len(ring)];h=9.6 if a<-23 and c<28 else top
            poly([(x,bed,z),(x,h,z),(xx,h,zz),(xx,bed,zz)],tile)
    for a,b,c,d,height in plan['landings']:block(a,b,c,d,bed,height)
    block(l,-12,n-.18,n,0,top)
    block(l,r,n-.20,n,bed,0)
    c,d=plan['lockerDoor']
    for z0,z1 in [(n,c),(d,s)]:block(r,r+.16,z0,z1,bed,top)
    block(r,r+.16,c,d,2.22,top)
    flush('Bath partitions and flooded stair')
    # The tall well is truly open above low roofs, with an offset sealed light.
    rects=[w['bounds'] for w in wells]+[w['bounds'] for w in zones]
    xs=sorted({l,r,*[x for a,b,c,d in rects for x in (a,b)]})
    zs=sorted({n,s,*[z for a,b,c,d in rects for z in (c,d)]})
    for a,b in zip(xs,xs[1:]):
        for c,d in zip(zs,zs[1:]):
            x,z=(a+b)/2,(c+d)/2
            if any(contains(w['bounds'],x,z) for w in wells):continue
            h=min([top]+[w['ceiling'] for w in zones if contains(w['bounds'],x,z)])
            block(a,b,c,d,h,h+.24,plaster)
    for zone in zones:
        a,b,c,d=zone['bounds'];h=zone['ceiling']
        for x in (a,b):block(x-.045,x+.045,c,d,h+.23,top+.23,plaster)
        for z in (c,d):block(a,b,z-.045,z+.045,h+.23,top+.23,plaster)
    for well in wells:
        a,b,c,d=well['bounds'];end=well['top'];ap=well['aperture']
        base=min([top]+[w['ceiling'] for w in zones if contains(w['bounds'],(a+b)/2,(c+d)/2)])
        # The roof slab already supplies the lower 24 cm of each reveal.
        for x in (a-.10,b+.10):block(x-.10,x+.10,c-.20,d+.20,base+.24,end+.24,plaster)
        for z in (c-.10,d+.10):block(a,b,z-.10,z+.10,base+.24,end+.24,plaster)
        xx=sorted({a,b,ap[0],ap[1]});zz=sorted({c,d,ap[2],ap[3]})
        for x0,x1 in zip(xx,xx[1:]):
            for z0,z1 in zip(zz,zz[1:]):
                if not contains(ap,(x0+x1)/2,(z0+z1)/2):block(x0,x1,z0,z1,end,end+.24,plaster)
        block(ap[0],ap[1],ap[2],ap[3],end+.28,end+.30,opal)
    flush('Stepped soffits and offset lightwells')
